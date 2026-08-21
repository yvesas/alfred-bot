import { IUser, Language } from "../../models/User";
import { ModuleId } from "../../modules/ModuleDefinition";
import { TaskService } from "../../modules/tasks/TaskService";
import { UserService } from "../../services/UserService";
import { PurchaseService } from "../../services/PurchaseService";

// Contrato de uma regra proativa.
//
// O Alfred só falava quando falavam com ele. Isto é o que muda: alguém olha o que
// está pendente e avisa sem ser perguntado — o que o Caddy vende como produto.
//
// **A fronteira do ADR-0004 vale aqui, e é o ponto todo.** O *mecanismo* — quando
// acordar, quanto pode falar, quando calar, como entregar — é chassi. A *regra* —
// "esta tarefa vence hoje", "este orçamento estourou" — é domínio, e mora no módulo.
// Uma regra não sabe que existe teto de frequência; o motor não sabe o que é orçamento.

/** Um aviso que a regra julga que vale a pena dar. */
export interface ProactiveCandidate {
  /**
   * Identidade do aviso, estável entre ciclos. É o que impede repetir a mesma coisa
   * a cada hora — inclui a data quando o aviso é do dia, para poder voltar amanhã.
   */
  key: string;
  /** Já localizado: a regra conhece o idioma, o motor não. */
  text: string;
  /**
   * Quanto isto importa, de 0 a 100. Só o melhor candidato do ciclo é enviado —
   * mandar três avisos de uma vez é o caminho mais curto para ser silenciado.
   */
  priority: number;
}

export interface ProactiveContext {
  user: IUser;
  /** `String(user._id)` — a identidade canônica. */
  userId: string;
  lang: Language;
  now: Date;
  deps: ProactiveDeps;
}

/** Serviços que uma regra pode alcançar. */
export interface ProactiveDeps {
  taskService: TaskService;
  userService: UserService;
  purchaseService: PurchaseService;
}

export interface ProactiveRule {
  /** Identificador estável, usado em log e métrica. */
  id: string;
  /** A que módulo esta regra pertence. Regra sem módulo não existe. */
  moduleId: ModuleId;
  evaluate(ctx: ProactiveContext): Promise<ProactiveCandidate[]>;
}

/** Prioridades, nomeadas para não virarem números mágicos espalhados. */
export const PRIORITY = {
  /** Já passou do prazo. */
  overdue: 90,
  /** Vence hoje. */
  dueToday: 70,
  /** Orçamento estourado. */
  budgetOver: 60,
  /** Chegando no teto do orçamento. */
  budgetWarning: 40,
} as const;
