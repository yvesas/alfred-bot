import { inject, injectable } from "inversify";
import { ReminderService } from "./ReminderService";
import { OutboundRegistry } from "../core/OutboundRegistry";
import { config } from "../infra/config";
import { logger } from "../infra/logger";
import { remindersSentTotal } from "../infra/metrics";
import { t } from "../i18n";

// Verifica periodicamente lembretes vencidos e dispara o push na plataforma de origem.
// Background job (não é um adapter): iniciado no index após os adapters subirem.
@injectable()
export class ReminderScheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    @inject(ReminderService) private reminders: ReminderService,
    @inject(OutboundRegistry) private outbound: OutboundRegistry,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), config.reminderIntervalMs);
    // Não bloqueia o encerramento do processo por causa do timer.
    this.timer.unref?.();
    logger.info(`⏰ ReminderScheduler ativo (intervalo ${config.reminderIntervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  // Exposto para testes e para o ciclo do timer.
  async tick(now: Date = new Date()): Promise<void> {
    try {
      const due = await this.reminders.findDue(now);
      for (const r of due) {
        const text = t(r.language ?? "pt", "reminder_push", {
          description: r.description,
          day: r.dayOfMonth,
        });
        const delivered = await this.outbound.send(r.platform, r.externalId, text);
        // Reprograma para o próximo mês de qualquer forma (lembrete mensal); se o usuário
        // estava offline (ex.: web sem aba aberta), apenas registramos.
        await this.reminders.markNotified(r, now);
        if (delivered) {
          remindersSentTotal.inc({ platform: r.platform });
        } else {
          logger.warn(
            { platform: r.platform, externalId: r.externalId },
            "Lembrete não entregue (usuário offline?)",
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "Erro no ciclo de lembretes");
    }
  }
}
