import { inject, injectable } from "inversify";
import { ProactiveService } from "../core/proactive/ProactiveService";
import { JobLockService } from "./JobLockService";
import { config } from "../infra/config";
import { logger } from "../infra/logger";

// Job da proatividade. Roda sob lock, como os outros dois — com N réplicas, N ciclos
// acordariam juntos e a pessoa receberia o mesmo aviso N vezes (C3).
const PROACTIVE_JOB = "proactive";

@injectable()
export class ProactiveScheduler {
  private timer?: NodeJS.Timeout;

  constructor(
    @inject(ProactiveService) private proactive: ProactiveService,
    @inject(JobLockService) private locks: JobLockService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), config.proactiveIntervalMs);
    this.timer.unref?.();
    logger.info(`💡 ProactiveScheduler ativo (intervalo ${config.proactiveIntervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(now: Date = new Date()): Promise<void> {
    try {
      await this.locks.runExclusively(PROACTIVE_JOB, config.proactiveIntervalMs, () =>
        this.sweep(now),
      );
    } catch (err) {
      logger.error({ err }, "Erro no ciclo de proatividade");
    }
  }

  private async sweep(now: Date): Promise<void> {
    const users = await this.proactive.eligibleUsers();
    let sent = 0;

    for (const user of users) {
      // Um usuário que estoura não pode calar o ciclo para os outros.
      try {
        const decision = await this.proactive.runFor(user, now);
        if (decision.sent) sent++;
      } catch (err) {
        logger.error({ err, userId: String(user._id) }, "Falha ao avaliar usuário");
      }
    }

    // Ciclo silencioso é o caso comum, e é isso que se quer — só registramos quando
    // houve algo, para o log não virar ruído.
    if (sent > 0) {
      logger.info({ users: users.length, sent }, "Ciclo proativo");
    }
  }
}
