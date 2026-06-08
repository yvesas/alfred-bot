import { inject, injectable } from "inversify";
import { RetentionService } from "./RetentionService";
import { config } from "../infra/config";
import { logger } from "../infra/logger";

// Job de retenção (LGPD): roda periodicamente e purga sessões anônimas inativas.
@injectable()
export class RetentionScheduler {
  private timer?: NodeJS.Timeout;

  constructor(@inject(RetentionService) private retention: RetentionService) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), config.retentionIntervalMs);
    this.timer.unref?.();
    logger.info(
      `🧹 RetentionScheduler ativo (a cada ${config.retentionIntervalMs}ms; ${config.anonRetentionDays} dias)`,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(now: Date = new Date()): Promise<void> {
    try {
      await this.retention.purgeAnonymous(now);
    } catch (err) {
      logger.error({ err }, "Erro no ciclo de retenção");
    }
  }
}
