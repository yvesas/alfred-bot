import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { MergeService, mergeCategories, mergeBudgets } from "./MergeService";
import { IUser, IUserCreate } from "../models/User";
import { config } from "../infra/config";
import { logger } from "../infra/logger";

// O usuário logado pelo WorkOS vive na plataforma "web", com externalId = id do WorkOS.
const WEB = "web" as const;

// Lida com a identidade canônica do login web (WorkOS) e com o merge da sessão anônima.
@injectable()
export class AccountService {
  constructor(
    @inject(UserRepository) private userRepo: UserRepository,
    @inject(PurchaseRepository) private purchaseRepo: PurchaseRepository,
    @inject(ReminderRepository) private reminderRepo: ReminderRepository,
    @inject(MergeService) private merge: MergeService,
  ) {}

  // Garante o usuário canônico do WorkOS. O perfil (nome/e-mail) pula o onboarding e o e-mail
  // verificado dispara o auto-vínculo com contas Telegram/WhatsApp do mesmo e-mail.
  async ensureWorkosUser(
    workosUserId: string,
    profile: { name?: string; email?: string },
  ): Promise<IUser> {
    const existing = await this.userRepo.findByIdentity(WEB, workosUserId);
    const email = profile.email?.toLowerCase();

    const patch: Partial<IUserCreate> = {
      status: "complete", // perfil do WorkOS → cadastro já completo
      ...(profile.name ? { name: profile.name } : {}),
      ...(email ? { email, verifiedEmail: email } : {}),
      // LGPD: login com perfil → registra o consentimento na versão atual da política.
      consentVersion: config.privacyPolicyVersion,
      consentAt: new Date(),
    };

    const user = existing
      ? ((await this.userRepo.updateByIdentity(WEB, workosUserId, patch)) ?? existing)
      : await this.userRepo.create({
          identities: [{ platform: WEB, externalId: workosUserId }],
          ...patch,
        } as IUserCreate);

    // E-mail verificado pelo WorkOS → tenta fundir com outra conta que já o tenha.
    if (email) {
      await this.merge.linkVerifiedEmail(WEB, workosUserId, email);
    }
    return user;
  }

  // Migra os dados da sessão anônima (clientId) para a conta logada (id do WorkOS).
  // Idempotente e seguro: nada acontece se os ids forem iguais ou não houver doc anônimo.
  async absorbAnonymous(canonicalExternalId: string, anonExternalId: string): Promise<void> {
    if (!anonExternalId || canonicalExternalId === anonExternalId) return;

    const anon = await this.userRepo.findByIdentity(WEB, anonExternalId);
    if (!anon) return; // sem conta anônima → nada a absorver
    const canonical = await this.userRepo.findByIdentity(WEB, canonicalExternalId);
    if (!canonical) return; // ensureWorkosUser roda antes; defensivo

    // Compras chaveiam por User._id (Fase 6); lembretes ainda por (platform, externalId) — alvo do push.
    const purchases = await this.purchaseRepo.reassignUser(String(anon._id), String(canonical._id));
    const reminders = await this.reminderRepo.reassignExternalId(
      WEB,
      anonExternalId,
      canonicalExternalId,
    );

    // Funde categorias/orçamentos do documento anônimo e o remove.
    await this.userRepo.updateByIdentity(WEB, canonicalExternalId, {
      categories: mergeCategories(canonical.categories, anon.categories),
      budgets: mergeBudgets(canonical.budgets, anon.budgets),
    });
    await this.userRepo.deleteByIdentity(WEB, anonExternalId);

    logger.info(
      { canonical: String(canonical._id), anon: String(anon._id), purchases, reminders },
      "Conta anônima absorvida no login",
    );
  }

  // Exclui a conta e todos os dados do usuário (compras, lembretes e o documento).
  async deleteAccount(user: IUser): Promise<{ purchases: number; reminders: number }> {
    const purchases = await this.purchaseRepo.deleteByUser(String(user._id));
    const reminders = await this.reminderRepo.deleteByIdentities(user.identities ?? []);
    await this.userRepo.deleteById(String(user._id));
    logger.info({ user: String(user._id), purchases, reminders }, "Conta excluída");
    return { purchases, reminders };
  }
}
