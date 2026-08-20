import { inject, injectable } from "inversify";
import { RetentionService } from "./RetentionService";
import { JobLockService } from "./JobLockService";
import { config } from "../infra/config";
import { logger } from "../infra/logger";

// Job de retenção (LGPD): roda periodicamente e purga sessões anônimas inativas.
// O ciclo roda sob lock — ver JobLockService.
const RETENTION_JOB = "retention";

@injectable()
export class RetentionScheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    @inject(RetentionService) private retention: RetentionService,
    @inject(JobLockService) private locks: JobLockService,
  ) {}

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
      // Sob lock: este job APAGA CONTAS. Duas instâncias purgando ao mesmo tempo é
      // pior que ruído — é exclusão concorrente sobre o mesmo conjunto (C3).
      await this.locks.runExclusively(RETENTION_JOB, config.retentionIntervalMs, async () => {
        await this.retention.purgeAnonymous(now);
      });
    } catch (err) {
      logger.error({ err }, "Erro no ciclo de retenção");
    }
  }
}
