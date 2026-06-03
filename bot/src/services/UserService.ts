import { inject, injectable } from "inversify";
import { UserRepository } from "../repositories/UserRepository";
import { IUser, IUserCreate, UserStatus } from "../models/User";
import { Platform } from "../core/IncomingMessage";
import { isValidEmail } from "../utils/validation";

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

  // Garante que existe um registro para a identidade. Se a plataforma informar o nome,
  // ele é aproveitado e o cadastro já pula para a etapa do e-mail.
  async ensureUser(
    platform: Platform,
    externalId: string,
    profile?: PlatformProfile,
  ): Promise<{ user: IUser; question: string }> {
    let user = await this.userRepo.findByIdentity(platform, externalId);

    if (!user) {
      const name = this.fullName(profile);
      const initial: IUserCreate = {
        identities: [{ platform, externalId }],
        // Mantém o campo legado preenchido para usuários do Telegram.
        ...(platform === "telegram" ? { telegramId: externalId } : {}),
        ...(name ? { name, status: "awaiting_email" } : { status: "awaiting_name" }),
      };
      user = await this.userRepo.create(initial);
    }

    return { user, question: this.questionFor(user.status) };
  }

  // Pergunta correspondente ao passo atual do onboarding (usada em re-prompts).
  questionFor(status: UserStatus): string {
    switch (status) {
      case "awaiting_name":
        return "Para começar, como você se chama? 🙂";
      case "awaiting_email":
        return `Me informe seu e-mail 📧 (ou envie ${SKIP_COMMAND}). Se quiser, toque no botão abaixo para compartilhar seu telefone.`;
      default:
        return "";
    }
  }

  // Avança a máquina de estados do cadastro com a resposta enviada pelo usuário.
  async submitAnswer(
    platform: Platform,
    externalId: string,
    text: string,
  ): Promise<{ reply: string; completed: boolean }> {
    const user = await this.userRepo.findByIdentity(platform, externalId);
    if (!user) {
      // Sem registro ainda: cria e faz a primeira pergunta sem consumir o texto como resposta.
      const { question } = await this.ensureUser(platform, externalId);
      return { reply: question, completed: false };
    }

    const answer = text.trim();

    switch (user.status) {
      case "awaiting_name": {
        if (answer.length < 2) {
          return { reply: "Por favor, me diga seu nome. 🙂", completed: false };
        }
        await this.userRepo.updateByIdentity(platform, externalId, {
          name: answer,
          status: "awaiting_email",
        });
        return {
          reply: `Prazer, ${answer}! ${this.questionFor("awaiting_email")}`,
          completed: false,
        };
      }

      case "awaiting_email": {
        if (answer.toLowerCase() === SKIP_COMMAND) {
          await this.userRepo.updateByIdentity(platform, externalId, { status: "complete" });
          return { reply: this.completionMessage(), completed: true };
        }
        if (!isValidEmail(answer)) {
          return {
            reply: `Hmm, esse e-mail não parece válido. Pode digitar novamente? (ou ${SKIP_COMMAND})`,
            completed: false,
          };
        }
        await this.userRepo.updateByIdentity(platform, externalId, {
          email: answer.toLowerCase(),
          status: "complete",
        });
        return { reply: this.completionMessage(), completed: true };
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
  ): Promise<{ reply: string; completed: boolean }> {
    const user =
      (await this.userRepo.findByIdentity(platform, externalId)) ??
      (await this.ensureUser(platform, externalId)).user;

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
      return { reply: "📱 Telefone atualizado com sucesso!", completed: true };
    }

    return {
      reply: `📱 Telefone salvo! ${this.questionFor("awaiting_email")}`,
      completed: false,
    };
  }

  private fullName(profile?: PlatformProfile): string | undefined {
    if (!profile?.firstName) {
      return undefined;
    }
    return [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  }

  private completionMessage(): string {
    return '✅ Cadastro concluído! Agora é só me enviar uma compra (ex.: "agua 7") ou um cupom fiscal. Use /gastos para ver seus gastos.';
  }
}
