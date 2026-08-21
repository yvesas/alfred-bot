import { inject, injectable } from "inversify";
import { ProactiveRule, ProactiveCandidate, ProactiveDeps } from "./ProactiveRule";
import { PROACTIVE_RULES } from "./rules";
import { OutboundRegistry } from "../OutboundRegistry";
import { langOf } from "../format";
import { ProactiveLogRepository } from "../../repositories/ProactiveLogRepository";
import { UserRepository } from "../../repositories/UserRepository";
import { TaskService } from "../../modules/tasks/TaskService";
import { UserService } from "../../services/UserService";
import { PurchaseService } from "../../services/PurchaseService";
import { IUser } from "../../models/User";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";
import {
  proactiveSentTotal,
  proactiveSuppressedTotal,
  proactiveRepliedTotal,
} from "../../infra/metrics";

// O motor da proatividade: decide **se** falar, e cala quando não há o que dizer.
//
// A parte difícil não é achar o que dizer — as regras fazem isso. É o resto:
//
// - **Um aviso por ciclo, no máximo.** Três de uma vez é o caminho mais curto para
//   ser silenciado.
// - **Teto diário.** Mesmo que haja o que dizer todo dia, há um limite.
// - **Horário.** Ninguém quer ser avisado de orçamento às três da manhã.
// - **Nunca repetir.** A chave do candidato é a identidade do aviso.
// - **Silêncio é resposta válida.** Ciclo sem nada a dizer é o caso comum, e sair
//   calado dele é a funcionalidade, não a ausência dela.

export interface ProactiveDecision {
  /** Enviou algo? */
  sent: boolean;
  /** Por que não, quando não. Vai para log e métrica. */
  reason?: "quiet-hours" | "daily-cap" | "nothing-to-say" | "already-said" | "no-channel";
}

@injectable()
export class ProactiveService {
  private readonly rules: ProactiveRule[] = PROACTIVE_RULES;

  constructor(
    @inject(UserRepository) private userRepo: UserRepository,
    @inject(ProactiveLogRepository) private logRepo: ProactiveLogRepository,
    @inject(OutboundRegistry) private outbound: OutboundRegistry,
    @inject(TaskService) private taskService: TaskService,
    @inject(UserService) private userService: UserService,
    @inject(PurchaseService) private purchaseService: PurchaseService,
  ) {}

  /** Avalia um usuário e, se valer, manda **um** aviso. */
  async runFor(user: IUser, now: Date = new Date()): Promise<ProactiveDecision> {
    const userId = String(user._id);

    // O canal é o primeiro corte: sem para onde mandar, nem vale consultar o banco.
    const identity = (user.identities ?? [])[0];
    if (!identity) return { sent: false, reason: "no-channel" };

    if (!withinActiveHours(now)) {
      return suppress("quiet-hours");
    }

    const sentToday = await this.logRepo.countSince(userId, startOfDay(now));
    if (sentToday >= config.proactiveDailyCap) {
      return suppress("daily-cap");
    }

    const best = await this.bestCandidate(user, userId, now);
    if (!best) return { sent: false, reason: "nothing-to-say" };

    // `claim` é atômico: se outra réplica já pegou este aviso, ela que mande.
    const mine = await this.logRepo.claim(userId, best.candidate.key, best.rule.id, now);
    if (!mine) return suppress("already-said");

    const delivered = await this.outbound.send(
      identity.platform,
      identity.externalId,
      best.candidate.text,
    );
    await this.logRepo.markDelivered(userId, best.candidate.key, delivered);

    if (delivered) {
      proactiveSentTotal.inc({ rule: best.rule.id });
      logger.info(
        { userId, rule: best.rule.id, key: best.candidate.key },
        "Aviso proativo enviado",
      );
    } else {
      // Não entregue não conta no teto — a pessoa não foi incomodada.
      logger.warn({ userId, rule: best.rule.id }, "Aviso proativo não entregue");
    }

    return { sent: delivered };
  }

  /**
   * O melhor candidato entre todas as regras — só um sai por ciclo.
   *
   * Regra que estoura não derruba as outras: uma consulta que falha não pode calar o
   * assistente inteiro.
   */
  private async bestCandidate(
    user: IUser,
    userId: string,
    now: Date,
  ): Promise<{ rule: ProactiveRule; candidate: ProactiveCandidate } | null> {
    const ctx = { user, userId, lang: langOf(user), now, deps: this.deps() };
    let best: { rule: ProactiveRule; candidate: ProactiveCandidate } | null = null;

    for (const rule of this.rules) {
      try {
        for (const candidate of await rule.evaluate(ctx)) {
          if (!best || candidate.priority > best.candidate.priority) {
            best = { rule, candidate };
          }
        }
      } catch (err) {
        logger.error({ err, rule: rule.id, userId }, "Regra proativa falhou");
      }
    }
    return best;
  }

  private deps(): ProactiveDeps {
    return {
      taskService: this.taskService,
      userService: this.userService,
      purchaseService: this.purchaseService,
    };
  }

  /** Usuários que podem receber aviso. Só quem tem identidade e cadastro completo. */
  async eligibleUsers(): Promise<IUser[]> {
    return this.userRepo.findProactiveCandidates(config.proactiveBatchSize);
  }

  /**
   * A pessoa escreveu — se foi logo depois de um aviso, o aviso serviu.
   *
   * É a única medida honesta que temos de "isto ajuda ou incomoda". Sem ela,
   * ajustaríamos as regras no escuro.
   */
  async noteUserReplied(userId: string, now: Date = new Date()): Promise<void> {
    const window = new Date(now.getTime() - config.proactiveResponseWindowMs);
    if (await this.logRepo.markResponded(userId, window, now)) {
      proactiveRepliedTotal.inc();
    }
  }
}

// ---------- Auxiliares puros ----------

function suppress(reason: NonNullable<ProactiveDecision["reason"]>): ProactiveDecision {
  proactiveSuppressedTotal.inc({ reason });
  return { sent: false, reason };
}

export function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Está dentro do horário em que dá para falar?
 *
 * Janela fixa por enquanto (`PROACTIVE_START_HOUR`/`END_HOUR`), no fuso do servidor.
 * Preferência por usuário — e fuso por usuário, que é o que realmente resolve — é o
 * passo seguinte; hoje o Alfred nem pergunta em que fuso a pessoa está.
 */
export function withinActiveHours(
  now: Date,
  start = config.proactiveStartHour,
  end = config.proactiveEndHour,
): boolean {
  const hour = now.getHours();
  return hour >= start && hour < end;
}
