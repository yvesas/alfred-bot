import { inject, injectable } from "inversify";
import { Telegraf, Context, Markup } from "telegraf";
import type { Message } from "telegraf/types";
import { IMessagingAdapter } from "../../core/IMessagingAdapter";
import { IncomingMessage } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { BotCore } from "../../core/BotCore";
import { OutboundRegistry, OutboundSender } from "../../core/OutboundRegistry";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";

// Adapter do Telegram (Telegraf): normaliza eventos para IncomingMessage, monta o Replier
// e delega a lógica ao BotCore. Não contém regra de conversa.
@injectable()
export class TelegramAdapter implements IMessagingAdapter, OutboundSender {
  private bot: Telegraf;

  constructor(
    @inject(BotCore) private core: BotCore,
    @inject(OutboundRegistry) private outbound: OutboundRegistry,
  ) {
    this.bot = new Telegraf(config.telegramToken);
  }

  // Push: o externalId do Telegram é o próprio chat id.
  async sendTo(externalId: string, text: string): Promise<boolean> {
    await this.bot.telegram.sendMessage(externalId, text);
    return true;
  }

  async start(): Promise<void> {
    this.outbound.register("telegram", this);
    this.bot.start((ctx) => this.dispatch(ctx, this.toCommand(ctx, "start")));
    this.bot.command("compras", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "compras")));
    this.bot.command("gastos", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "gastos")));
    this.bot.command("ia", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "ia")));
    this.bot.command("excluir", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "excluir")));
    this.bot.command("editar", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "editar")));
    this.bot.command("categorias", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "categorias")));
    this.bot.command("idioma", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "idioma")));
    this.bot.command("orcamento", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "orcamento")));
    this.bot.command("lembretes", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "lembretes")));
    this.bot.command("vincular", (ctx) => this.dispatch(ctx, this.toCommand(ctx, "vincular")));

    this.bot.on("text", (ctx) => this.dispatch(ctx, this.toText(ctx)));
    this.bot.on("photo", (ctx) => this.dispatch(ctx, this.toPhoto(ctx)));
    this.bot.on("contact", (ctx) => this.handleContact(ctx));

    // Não aguardamos launch(): em long-polling ele só resolve quando o bot é parado.
    this.bot.launch().catch((err) => logger.error({ err }, "Telegram launch falhou"));
    logger.info("🚀 Telegram adapter iniciado");
  }

  async stop(): Promise<void> {
    this.bot.stop("shutdown");
  }

  // ---------- helpers ----------

  private async dispatch(ctx: Context, msg: IncomingMessage): Promise<void> {
    await this.core.handle(msg, this.replier(ctx));
  }

  private replier(ctx: Context): Replier {
    return {
      text: async (message, options) => {
        const extra = options?.requestPhone ? this.contactKeyboard() : Markup.removeKeyboard();
        await ctx.reply(message, extra);
      },
    };
  }

  private contactKeyboard() {
    return Markup.keyboard([Markup.button.contactRequest("📱 Compartilhar telefone")])
      .resize()
      .oneTime();
  }

  private profileFrom(ctx: Context) {
    return { firstName: ctx.from?.first_name, lastName: ctx.from?.last_name };
  }

  private toText(ctx: Context): IncomingMessage {
    return {
      platform: "telegram",
      externalId: String(ctx.from?.id),
      kind: "text",
      text: (ctx.message as Message.TextMessage).text,
      profile: this.profileFrom(ctx),
    };
  }

  private toCommand(ctx: Context, name: string): IncomingMessage {
    const text = (ctx.message as Message.TextMessage)?.text ?? "";
    const args = text.split(" ").slice(1);
    return {
      platform: "telegram",
      externalId: String(ctx.from?.id),
      kind: "command",
      command: { name, args },
      profile: this.profileFrom(ctx),
    };
  }

  private toPhoto(ctx: Context): IncomingMessage {
    return {
      platform: "telegram",
      externalId: String(ctx.from?.id),
      kind: "photo",
      getImageBase64: () => this.downloadPhoto(ctx),
    };
  }

  private async downloadPhoto(ctx: Context): Promise<string> {
    const message = ctx.message;
    if (!message || !("photo" in message)) {
      throw new Error("Mensagem sem foto");
    }
    const photo = message.photo[message.photo.length - 1]; // melhor resolução
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  }

  private async handleContact(ctx: Context): Promise<void> {
    const contact = (ctx.message as Message.ContactMessage).contact;
    const userId = String(ctx.from?.id);

    // Só aceitamos o contato do próprio usuário (checagem específica do Telegram).
    if (contact.user_id && String(contact.user_id) !== userId) {
      await ctx.reply("Por favor, compartilhe o seu próprio contato. 🙂");
      return;
    }

    await this.dispatch(ctx, {
      platform: "telegram",
      externalId: userId,
      kind: "contact",
      contact: { phone: contact.phone_number, name: contact.first_name },
    });
  }
}
