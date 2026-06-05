import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { IUser, IUserCreate, IIdentity, IBudget } from "../models/User";
import { Platform } from "../core/IncomingMessage";
import { logger } from "../infra/logger";

// Fusão de contas (Fase 6): identidades verificadas (e-mail/telefone) que apontam para a mesma
// pessoa fundem dois `User` num só (canônico por `User._id`). Reaproveita os reassign por `_id`.
@injectable()
export class MergeService {
  constructor(
    @inject(UserRepository) private userRepo: UserRepository,
    @inject(PurchaseRepository) private purchaseRepo: PurchaseRepository,
  ) {}

  // Registra um e-mail verificado na conta atual e funde com outra conta que já o tenha.
  async linkVerifiedEmail(platform: Platform, externalId: string, email: string): Promise<void> {
    const value = email.trim().toLowerCase();
    if (!value) return;
    const current = await this.userRepo.findByIdentity(platform, externalId);
    if (!current) return;

    if (current.verifiedEmail !== value) {
      await this.userRepo.updateById(String(current._id), { verifiedEmail: value });
      current.verifiedEmail = value;
    }

    const twin = await this.userRepo.findByVerifiedEmail(value, String(current._id));
    await this.maybeMerge(current, twin);
  }

  // Registra um telefone verificado na conta atual e funde com outra que já o tenha.
  async linkVerifiedPhone(platform: Platform, externalId: string, phone: string): Promise<void> {
    const value = normalizePhone(phone);
    if (!value) return;
    const current = await this.userRepo.findByIdentity(platform, externalId);
    if (!current) return;

    if (current.verifiedPhone !== value) {
      await this.userRepo.updateById(String(current._id), { verifiedPhone: value });
      current.verifiedPhone = value;
    }

    const twin = await this.userRepo.findByVerifiedPhone(value, String(current._id));
    await this.maybeMerge(current, twin);
  }

  // Vincula a identidade (platform, externalId) à conta canônica de um deep-link (Fase 6).
  // A conta canônica (web/login) é a primária; a de chat é fundida nela. Retorna false se algo
  // não existir. true também quando já são a mesma conta (idempotente).
  async linkAccounts(
    platform: Platform,
    externalId: string,
    canonicalUserId: string,
  ): Promise<boolean> {
    const current = await this.userRepo.findByIdentity(platform, externalId);
    const canonical = await this.userRepo.findById(canonicalUserId);
    if (!current || !canonical) return false;
    if (String(current._id) === String(canonical._id)) return true;
    await this.mergeUsers(canonical, current);
    return true;
  }

  // Funde `secondary` em `primary` (canônico). Reatribui compras por `_id`, une identidades e
  // preferências, e remove o doc secundário. Idempotente p/ ids iguais.
  async mergeUsers(primary: IUser, secondary: IUser): Promise<IUser> {
    if (String(primary._id) === String(secondary._id)) return primary;

    const purchases = await this.purchaseRepo.reassignUser(
      String(secondary._id),
      String(primary._id),
    );

    const patch: Partial<IUserCreate> = {
      identities: unionIdentities(primary.identities, secondary.identities),
      name: primary.name ?? secondary.name,
      email: primary.email ?? secondary.email,
      phone: primary.phone ?? secondary.phone,
      verifiedEmail: primary.verifiedEmail ?? secondary.verifiedEmail,
      verifiedPhone: primary.verifiedPhone ?? secondary.verifiedPhone,
      language: primary.language ?? secondary.language,
      aiModel: primary.aiModel ?? secondary.aiModel,
      categories: mergeCategories(primary.categories, secondary.categories),
      budgets: mergeBudgets(primary.budgets, secondary.budgets),
      status: "complete",
    };

    await this.userRepo.updateById(String(primary._id), patch);
    await this.userRepo.deleteById(String(secondary._id));

    logger.info(
      { primary: String(primary._id), secondary: String(secondary._id), purchases },
      "Contas fundidas (Fase 6)",
    );
    return primary;
  }

  // Funde se o gêmeo existir e for outra conta. Escolhe a conta web (login) como primária,
  // senão mantém o gêmeo (conta já estabelecida) como primária.
  private async maybeMerge(current: IUser, twin: IUser | null): Promise<void> {
    if (!twin || String(twin._id) === String(current._id)) return;
    const [primary, secondary] = choosePrimary(twin, current);
    await this.mergeUsers(primary, secondary);
  }
}

function hasWebIdentity(user: IUser): boolean {
  return (user.identities ?? []).some((i) => i.platform === "web");
}

// Prefere a conta com login web (WorkOS); senão, a primeira (conta já estabelecida).
function choosePrimary(established: IUser, current: IUser): [IUser, IUser] {
  if (hasWebIdentity(current) && !hasWebIdentity(established)) return [current, established];
  return [established, current];
}

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^\d]/g, "");
}

export function unionIdentities(a: IIdentity[] = [], b: IIdentity[] = []): IIdentity[] {
  const key = (i: IIdentity) => `${i.platform}:${i.externalId}`;
  const seen = new Set(a.map(key));
  const merged = [...a];
  for (const id of b) {
    if (!seen.has(key(id))) {
      seen.add(key(id));
      merged.push(id);
    }
  }
  return merged;
}

export function mergeCategories(a: string[] = [], b: string[] = []): string[] {
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

export function mergeBudgets(a: IBudget[] = [], b: IBudget[] = []): IBudget[] {
  const byCat = new Map(a.map((x) => [x.category.toLowerCase(), x]));
  for (const x of b) {
    if (!byCat.has(x.category.toLowerCase())) byCat.set(x.category.toLowerCase(), x);
  }
  return [...byCat.values()];
}
