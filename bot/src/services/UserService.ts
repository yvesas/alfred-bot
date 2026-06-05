import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { IUser, IUserCreate, UserStatus, Language, IBudget } from "../models/User";
import { Platform } from "../core/IncomingMessage";
import { isValidEmail } from "../utils/validation";
import { t } from "../i18n";
import { config } from "../infra/config";

export const SKIP_COMMAND = "/pular";

// Dados de perfil que algumas plataformas já entregam (Telegram: nome).
export interface PlatformProfile {
  firstName?: string;
  lastName?: string;
}

@injectable()
export class UserService {
  constructor(@inject(UserRepository) private userRepo: UserRepository) {}

  async findByIdentity(platform: Platform, externalId: string): Promise<IUser | null> {
    return await this.userRepo.findByIdentity(platform, externalId);
  }

  // ---------- Categorias personalizadas ----------

  async getCategories(platform: Platform, externalId: string): Promise<string[]> {
    const user = await this.userRepo.findByIdentity(platform, externalId);
    return user?.categories ?? [];
  }

  async addCategory(platform: Platform, externalId: string, name: string): Promise<string[]> {
    const current = await this.getCategories(platform, externalId);
    const exists = current.some((c) => c.toLowerCase() === name.toLowerCase());
    const next = exists ? current : [...current, name];
    await this.userRepo.updateByIdentity(platform, externalId, { categories: next });
    return next;
  }

  async removeCategory(platform: Platform, externalId: string, name: string): Promise<string[]> {
    const current = await this.getCategories(platform, externalId);
    const next = current.filter((c) => c.toLowerCase() !== name.toLowerCase());
    await this.userRepo.updateByIdentity(platform, externalId, { categories: next });
    return next;
  }

  async setLanguage(platform: Platform, externalId: string, language: Language): Promise<void> {
    await this.userRepo.updateByIdentity(platform, externalId, { language });
  }

  // ---------- Orçamentos mensais por categoria ----------

  async getBudgets(platform: Platform, externalId: string): Promise<IBudget[]> {
    const user = await this.userRepo.findByIdentity(platform, externalId);
    return user?.budgets ?? [];
  }

  // Define (ou atualiza) o orçamento de uma categoria. Case-insensitive na categoria.
  async setBudget(
    platform: Platform,
    externalId: string,
    category: string,
    limit: number,
  ): Promise<IBudget[]> {
    const current = await this.getBudgets(platform, externalId);
    const others = current.filter((b) => b.category.toLowerCase() !== category.toLowerCase());
    const next = [...others, { category, limit }];
    await this.userRepo.updateByIdentity(platform, externalId, { budgets: next });
    return next;
  }

  async removeBudget(platform: Platform, externalId: string, category: string): Promise<IBudget[]> {
    const current = await this.getBudgets(platform, externalId);
    const next = current.filter((b) => b.category.toLowerCase() !== category.toLowerCase());
    await this.userRepo.updateByIdentity(platform, externalId, { budgets: next });
    return next;
  }

  // Garante que existe um registro para a identidade. Se a plataforma informar o nome,
  // ele é aproveitado e o cadastro já pula para a etapa do e-mail.
  async ensureUser(
    platform: Platform,
    externalId: string,
    profile?: PlatformProfile,
    lang: Language = "pt",
  ): Promise<{ user: IUser; question: string }> {
    let user = await this.userRepo.findByIdentity(platform, externalId);

    if (!user) {
      const name = this.fullName(profile);
      const initial: IUserCreate = {
        identities: [{ platform, externalId }],
        // Mantém o campo legado preenchido para usuários do Telegram.
        ...(platform === "telegram" ? { telegramId: externalId } : {}),
        // No WhatsApp o externalId já é o número de telefone.
        ...(platform === "whatsapp" ? { phone: externalId } : {}),
        ...(name ? { name, status: "awaiting_email" } : { status: "awaiting_name" }),
      };
      user = await this.userRepo.create(initial);
    }

    return { user, question: this.questionFor(user.status, user.language ?? lang) };
  }

  // Pergunta correspondente ao passo atual do onboarding (usada em re-prompts).
  questionFor(status: UserStatus, lang: Language = "pt"): string {
    switch (status) {
      case "awaiting_name":
        return t(lang, "onboarding_ask_name");
      case "awaiting_email":
        return t(lang, "onboarding_ask_email");
      default:
        return "";
    }
  }

  // Avança a máquina de estados do cadastro com a resposta enviada pelo usuário.
  async submitAnswer(
    platform: Platform,
    externalId: string,
    text: string,
    lang: Language = "pt",
  ): Promise<{ reply: string; completed: boolean }> {
    const user = await this.userRepo.findByIdentity(platform, externalId);
    if (!user) {
      // Sem registro ainda: cria e faz a primeira pergunta sem consumir o texto como resposta.
      const { question } = await this.ensureUser(platform, externalId, undefined, lang);
      return { reply: question, completed: false };
    }

    const userLang = user.language ?? lang;
    const answer = text.trim();

    switch (user.status) {
      case "awaiting_name": {
        if (answer.length < 2) {
          return { reply: t(userLang, "onboarding_name_too_short"), completed: false };
        }
        await this.userRepo.updateByIdentity(platform, externalId, {
          name: answer,
          status: "awaiting_email",
        });
        return {
          reply: t(userLang, "onboarding_name_saved", {
            name: answer,
            askEmail: this.questionFor("awaiting_email", userLang),
          }),
          completed: false,
        };
      }

      case "awaiting_email": {
        if (answer.toLowerCase() === SKIP_COMMAND) {
          await this.userRepo.updateByIdentity(platform, externalId, {
            status: "complete",
            ...this.consentPatch(),
          });
          return { reply: this.completionReply(userLang), completed: true };
        }
        if (!isValidEmail(answer)) {
          return { reply: t(userLang, "onboarding_email_invalid"), completed: false };
        }
        await this.userRepo.updateByIdentity(platform, externalId, {
          email: answer.toLowerCase(),
          status: "complete",
          ...this.consentPatch(),
        });
        return { reply: this.completionReply(userLang), completed: true };
      }

      default:
        return { reply: "", completed: true };
    }
  }

  // Guarda o telefone compartilhado pelo usuário (botão "compartilhar contato").
  // Aproveita o nome do contato caso ainda não tenhamos um.
  async saveContact(
    platform: Platform,
    externalId: string,
    phone: string,
    contactName?: string,
    lang: Language = "pt",
  ): Promise<{ reply: string; completed: boolean }> {
    const user =
      (await this.userRepo.findByIdentity(platform, externalId)) ??
      (await this.ensureUser(platform, externalId, undefined, lang)).user;

    const userLang = user.language ?? lang;

    const patch: Partial<IUserCreate> = { phone };
    if (!user.name && contactName) {
      patch.name = contactName;
    }

    // Se ainda faltava o nome e o contato trouxe um, avança para a etapa do e-mail.
    if (user.status === "awaiting_name" && (user.name || patch.name)) {
      patch.status = "awaiting_email";
    }

    await this.userRepo.updateByIdentity(platform, externalId, patch);

    if (user.status === "complete") {
      return { reply: t(userLang, "phone_updated"), completed: true };
    }

    return {
      reply: t(userLang, "phone_saved", { askEmail: this.questionFor("awaiting_email", userLang) }),
      completed: false,
    };
  }

  private fullName(profile?: PlatformProfile): string | undefined {
    if (!profile?.firstName) {
      return undefined;
    }
    return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  }

  // LGPD: registra a versão da política aceita ao concluir o cadastro (consentimento).
  private consentPatch(): Partial<IUserCreate> {
    return { consentVersion: config.privacyPolicyVersion, consentAt: new Date() };
  }

  private completionReply(lang: Language): string {
    const url = config.webAppUrl ? `${config.webAppUrl}/privacidade` : "Política de Privacidade";
    return `${t(lang, "onboarding_complete")}\n\n${t(lang, "consent_notice", { url })}`;
  }
}
