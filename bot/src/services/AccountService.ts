import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { IUser, IUserCreate, IBudget } from "../models/User";
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
  ) {}

  // Garante o usuário canônico do WorkOS. O perfil (nome/e-mail) pula o onboarding.
  async ensureWorkosUser(
    workosUserId: string,
    profile: { name?: string; email?: string },
  ): Promise<IUser> {
    const existing = await this.userRepo.findByIdentity(WEB, workosUserId);

    const patch: Partial<IUserCreate> = {
      status: "complete", // perfil do WorkOS → cadastro já completo
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.email ? { email: profile.email.toLowerCase() } : {}),
    };

    if (existing) {
      return (await this.userRepo.updateByIdentity(WEB, workosUserId, patch)) ?? existing;
    }

    return await this.userRepo.create({
      identities: [{ platform: WEB, externalId: workosUserId }],
      ...patch,
    } as IUserCreate);
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
}

// Une categorias sem duplicar (case-insensitive), preservando a grafia da conta canônica.
function mergeCategories(a: string[] = [], b: string[] = []): string[] {
  const seen = new Set(a.map((c) => c.toLowerCase()));
  const merged = [...a];
  for (const c of b) {
    if (!seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      merged.push(c);
    }
  }
  return merged;
}

// Une orçamentos por categoria; o da conta canônica vence em caso de conflito.
function mergeBudgets(a: IBudget[] = [], b: IBudget[] = []): IBudget[] {
  const byCat = new Map(a.map((x) => [x.category.toLowerCase(), x]));
  for (const x of b) {
    if (!byCat.has(x.category.toLowerCase())) {
      byCat.set(x.category.toLowerCase(), x);
    }
  }
  return [...byCat.values()];
}
