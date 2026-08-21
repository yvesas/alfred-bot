import { inject, injectable } from "inversify";
import { Telegraf, Context, Markup } from "telegraf";
import type { Message } from "telegraf/types";
import { IMessagingAdapter } from "../../core/IMessagingAdapter";
import { IncomingMessage } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { BotCore } from "../../core/BotCore";
import { OutboundRegistry, OutboundSender } from "../../core/OutboundRegistry";
import {
  toTelegramText,
  toTelegramCommand,
  toTelegramPhoto,
  toTelegramContact,
  bestResolution,
} from "./translate";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";
import { KNOWN_COMMANDS } from "../../core/commands";
import { helpCommands, MENU_LANGUAGES } from "../../core/help";

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

    // Derivado do catálogo, não digitado. Antes eram 16 linhas escritas à mão, e a
    // lista já tinha divergido: `/tarefas` nasceu na Fase 1 e nunca foi registrado
    // aqui, então chegava como texto e ia parar na IA como se fosse uma compra.
    // Comando que existe no registro passa a existir no Telegram, sem segunda lista.
    for (const name of KNOWN_COMMANDS) {
      if (name === "start") continue; // já tratado acima, com o token do deep-link
      this.bot.command(name, (ctx) => this.dispatch(ctx, this.toCommand(ctx, name)));
    }

    await this.publishCommandMenu();

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

  // O menu que o Telegram mostra ao lado do campo de texto. Sai do mesmo catálogo, num
  // idioma por vez — o Telegram guarda uma lista por `language_code` e escolhe pela
  // configuração do aplicativo do usuário, não pela do Alfred.
  //
  // Falha aqui não derruba o bot: menu é conveniência, e ficar fora do ar por causa da
  // decoração seria pior que ficar sem ela.
  private async publishCommandMenu(): Promise<void> {
    for (const lang of MENU_LANGUAGES) {
      const commands = helpCommands(lang).map(({ name, summary }) => ({
        command: name,
        // O Telegram corta em 256 caracteres e rejeita a chamada inteira se passar.
        description: summary.slice(0, 256),
      }));
      try {
        await this.bot.telegram.setMyCommands(commands, { language_code: lang });
      } catch (err) {
        logger.warn({ err, lang }, "Não foi possível publicar o menu de comandos");
      }
    }
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
      document: async (content, filename) => {
        await ctx.replyWithDocument({ source: content, filename });
      },
    };
  }

  private contactKeyboard() {
    return Markup.keyboard([Markup.button.contactRequest("📱 Compartilhar telefone")])
      .resize()
      .oneTime();
  }

  private toText(ctx: Context): IncomingMessage {
    return toTelegramText(ctx.from, (ctx.message as Message.TextMessage).text);
  }

  private toCommand(ctx: Context, name: string): IncomingMessage {
    return toTelegramCommand(ctx.from, name, (ctx.message as Message.TextMessage)?.text ?? "");
  }

  private toPhoto(ctx: Context): IncomingMessage {
    return toTelegramPhoto(ctx.from, () => this.downloadPhoto(ctx));
  }

  private async downloadPhoto(ctx: Context): Promise<string> {
    const message = ctx.message;
    if (!message || !("photo" in message)) {
      throw new Error("Mensagem sem foto");
    }
    const photo = bestResolution(message.photo);
    const file = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  }

  // Só normaliza. A recusa do contato de terceiro é do BotCore, que sabe o idioma do
  // usuário — o adapter não sabe, e por isso respondia em português fixo (C15).
  private async handleContact(ctx: Context): Promise<void> {
    const contact = (ctx.message as Message.ContactMessage).contact;
    await this.dispatch(ctx, toTelegramContact(String(ctx.from?.id), contact));
  }
}
