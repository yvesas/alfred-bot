import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { AccountService } from "./AccountService";
import { config } from "../infra/config";
import { logger } from "../infra/logger";

// LGPD — minimização/retenção: apaga sessões web ANÔNIMAS inativas (nunca logaram), que são
// efetivamente descartáveis. Usuários reais (login/identidade verificada, Telegram/WhatsApp)
// nunca entram no critério (ver UserRepository.findAnonymousInactive).
@injectable()
export class RetentionService {
  constructor(
    @inject(UserRepository) private userRepo: UserRepository,
    @inject(AccountService) private accounts: AccountService,
  ) {}

  async purgeAnonymous(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - config.anonRetentionDays * 24 * 60 * 60 * 1000);
    const users = await this.userRepo.findAnonymousInactive(cutoff);
    for (const user of users) {
      await this.accounts.deleteAccount(user);
    }
    if (users.length > 0) {
      logger.info({ count: users.length, cutoff }, "Sessões anônimas inativas purgadas (LGPD)");
    }
    return users.length;
  }
}
