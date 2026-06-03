import { Telegraf, Context, Markup } from "telegraf";
import type { Message } from "telegraf/types";
import { container } from "../infra/Container";
import { PurchaseService } from "./PurchaseService";
import { OcrService } from "./OcrService";
import { UserService } from "./UserService";
import {
  MessageProcessingService,
  ModelResponse,
  SpendingGroupBy,
  SpendingPeriod,
} from "./MessageProcessingService";
import { convertModelResponseToPurchase } from "../infra/converters/purchaseConverter";

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  throw new Error("Bot access token not found. Check TELEGRAM TOKEN environment variable.");
}

export class TelegramBot {
  private bot: Telegraf;
  private purchaseService: PurchaseService;
  private ocrService: OcrService;
  private userService: UserService;
  private messageProcessingService: MessageProcessingService;

  constructor() {
    this.bot = new Telegraf(token || "");
    this.purchaseService = container.get(PurchaseService);
    this.ocrService = container.get(OcrService);
    this.userService = container.get(UserService);
    this.messageProcessingService = container.get(MessageProcessingService);

    this.setUpBot();
  }

  private setUpBot() {
    this.bot.start((ctx) => this.handleStart(ctx));
    this.bot.command("compras", (ctx) => this.handleGetPurchases(ctx));
    this.bot.command("gastos", (ctx) => this.handleGastosCommand(ctx));
    this.bot.command("ia", (ctx) => this.handleSetIAModel(ctx));

    this.bot.on("text", (ctx: Context) => this.handleText(ctx));
    this.bot.on("photo", (ctx: Context) => this.handlePhoto(ctx));
    this.bot.on("contact", (ctx: Context) => this.handleContact(ctx));
    this.bot.launch().then(() => console.info("🚀 Bot was launched!"));
  }

  // Encerra o bot de forma limpa (chamado em SIGINT/SIGTERM, ex.: parada de container).
  stop(signal: string) {
    console.info(`🛑 Encerrando o bot (${signal})...`);
    this.bot.stop(signal);
  }

  // ---------- Onboarding / cadastro ----------

  // Perfil que o Telegram já entrega automaticamente sobre quem está falando com o bot.
  private profileFrom(ctx: Context) {
    return { firstName: ctx.from?.first_name, lastName: ctx.from?.last_name };
  }

  // Teclado com o botão de compartilhar telefone, exibido durante o cadastro.
  private onboardingKeyboard() {
    return Markup.keyboard([Markup.button.contactRequest("📱 Compartilhar telefone")])
      .resize()
      .oneTime();
  }

  // Responde uma etapa do cadastro: mostra o teclado de contato enquanto não concluído.
  private async replyOnboarding(ctx: Context, text: string, completed: boolean) {
    await ctx.reply(text, completed ? Markup.removeKeyboard() : this.onboardingKeyboard());
  }

  private async handleStart(ctx: Context) {
    const userId = String(ctx.from?.id);
    const { user, question } = await this.userService.ensureUser(userId, this.profileFrom(ctx));

    if (user.status === "complete") {
      await ctx.reply(
        `Olá de novo${user.name ? `, ${user.name}` : ""}! 👋 Envie uma compra (ex.: "agua 7"), um cupom fiscal, ou use /gastos.`,
        Markup.removeKeyboard(),
      );
      return;
    }

    await this.replyOnboarding(
      ctx,
      `👋 Olá${user.name ? `, ${user.name}` : ""}! Eu registro suas compras e gastos pelo Telegram. ${question}`,
      false,
    );
  }

  private async handleContact(ctx: Context) {
    const contact = (ctx.message as Message.ContactMessage).contact;
    const userId = String(ctx.from?.id);

    // Só aceitamos o contato do próprio usuário.
    if (contact.user_id && String(contact.user_id) !== userId) {
      await ctx.reply("Por favor, compartilhe o seu próprio contato. 🙂");
      return;
    }

    const { reply, completed } = await this.userService.saveContact(
      userId,
      contact.phone_number,
      contact.first_name,
    );
    await this.replyOnboarding(ctx, reply, completed);
  }

  // Garante que o usuário concluiu o cadastro antes de usar um comando.
  // Retorna true se já está registrado; caso contrário, conduz o cadastro e retorna false.
  private async requireRegistered(ctx: Context, userId: string): Promise<boolean> {
    const user = await this.userService.findByTelegramId(userId);
    if (user && user.status === "complete") {
      return true;
    }
    const { question } = await this.userService.ensureUser(userId);
    await ctx.reply(`Antes disso, vamos concluir seu cadastro. ${question}`);
    return false;
  }

  // ---------- Mensagens ----------

  private async handleText(ctx: Context) {
    const message = ctx.message as Message.TextMessage;
    const userId = String(ctx.message?.from.id);

    const user = await this.userService.findByTelegramId(userId);

    if (!user) {
      // Primeiro contato: o Telegram já nos dá o id e o nome do perfil — cadastro quase automático.
      const { user: created, question } = await this.userService.ensureUser(
        userId,
        this.profileFrom(ctx),
      );
      await this.replyOnboarding(
        ctx,
        `👋 Olá${created.name ? `, ${created.name}` : ""}! Eu registro suas compras e gastos pelo Telegram. ${question}`,
        created.status === "complete",
      );
      return;
    }

    // Em cadastro: a mensagem é a resposta da etapa atual (nome ou e-mail).
    if (user.status !== "complete") {
      const { reply, completed } = await this.userService.submitAnswer(userId, message.text);
      await this.replyOnboarding(ctx, reply, completed);
      return;
    }

    const processed = await this.messageProcessingService.processMessage(userId, message.text);
    await this.handleProcessedMessage(ctx, userId, processed);
  }

  private async handlePhoto(ctx: Context) {
    const { message } = ctx;

    if (!this.isPhotoMessage(message)) {
      await ctx.reply("Envie uma foto para que eu possa processá-la.");
      return;
    }

    const userId = String(ctx.from?.id);
    if (!(await this.requireRegistered(ctx, userId))) {
      return;
    }

    const fileId = message.photo[message.photo.length - 1].file_id; // Pega a imagem de melhor resolução
    const file = await ctx.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    try {
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString("base64");

      const processed = await this.processReceiptImage(userId, base64Image);
      await this.handleProcessedMessage(ctx, userId, processed);
    } catch (error) {
      console.error("Erro ao baixar/processar a imagem:", error);
      await ctx.reply("Houve um erro ao processar a imagem. Tente novamente.");
    }
  }

  // OCR_MODE=multimodal: imagem → JSON numa única chamada ao modelo (Fase 3).
  // Caso contrário (ou se o modelo não suportar imagem): OCR → texto → extração.
  private async processReceiptImage(userId: string, base64Image: string): Promise<ModelResponse> {
    const multimodal = (process.env.OCR_MODE ?? "ocr").toLowerCase() === "multimodal";

    if (multimodal) {
      const direct = await this.messageProcessingService.processImage(userId, base64Image);
      if (direct) {
        return direct;
      }
    }

    const ocrText = await this.ocrService.extractTextFromImage(base64Image);
    return this.messageProcessingService.processMessage(userId, ocrText);
  }

  // Roteia a resposta da IA: consulta de gastos, registro de compra ou erro.
  private async handleProcessedMessage(ctx: Context, userId: string, processed: ModelResponse) {
    if (processed.intent === "query") {
      await this.handleSpendingQuery(ctx, userId, processed.period, processed.groupBy);
      return;
    }

    if (processed.intent !== "purchase") {
      await ctx.reply(
        processed.message ||
          "❌ Não consegui identificar os dados. Pode repetir com mais detalhes?",
      );
      return;
    }

    const purchaseData = convertModelResponseToPurchase(processed);
    try {
      await this.purchaseService.addPurchase(purchaseData);
      await ctx.reply(
        `🛒 Compra registrada: ${purchaseData.description} - Total de R$ ${purchaseData.total.toFixed(2)}`,
      );
    } catch (error) {
      console.error("Erro ao registrar compra:", error);
      await ctx.reply(
        "❌ Não consegui registrar essa compra. Verifique os valores e tente novamente.",
      );
    }
  }

  // ---------- Consulta de gastos ----------

  private async handleGastosCommand(ctx: Context) {
    const userId = String(ctx.from?.id);
    if (!(await this.requireRegistered(ctx, userId))) {
      return;
    }
    await this.handleSpendingQuery(ctx, userId, "current_month");
  }

  private async handleSpendingQuery(
    ctx: Context,
    userId: string,
    period: SpendingPeriod = "current_month",
    groupBy?: SpendingGroupBy,
  ) {
    const report = await this.purchaseService.getSpendingReport(userId, period);
    const label = this.periodLabel(report.period);

    if (report.count === 0) {
      await ctx.reply(`Você não tem gastos registrados ${label}.`);
      return;
    }

    let message = `📊 Gastos ${label}: R$ ${report.total.toFixed(2)} em ${report.count} compra(s).`;

    if (groupBy === "category") {
      message += this.formatBreakdown("Por categoria", report.byCategory);
    } else if (groupBy === "store") {
      message += this.formatBreakdown("Por loja", report.byStore);
    }

    await ctx.reply(message);
  }

  private periodLabel(period: SpendingPeriod): string {
    switch (period) {
      case "last_month":
        return "do mês passado";
      case "all":
        return "no total";
      case "current_month":
      default:
        return "deste mês";
    }
  }

  private formatBreakdown(title: string, data: Record<string, number>): string {
    const lines = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => `• ${key}: R$ ${value.toFixed(2)}`);

    if (lines.length === 0) {
      return "";
    }
    return `\n\n${title}:\n${lines.join("\n")}`;
  }

  // ---------- Outros comandos ----------

  private async handleSetIAModel(ctx: Context) {
    const userId = String(ctx.message?.from.id);
    if (!(await this.requireRegistered(ctx, userId))) {
      return;
    }

    const model = (ctx.message as Message.TextMessage)?.text.split(" ")[1]?.toLowerCase();
    if (!model) {
      return ctx.reply("Use: /ia gpt ou /ia gemini");
    }

    const response = this.messageProcessingService.setUserModel(userId, model);
    ctx.reply(response);
  }

  private async handleGetPurchases(ctx: Context) {
    const userId = String(ctx.message?.from.id);
    if (!(await this.requireRegistered(ctx, userId))) {
      return;
    }

    const purchases = await this.purchaseService.getUserPurchases(userId);

    if (purchases.length === 0) {
      await ctx.reply("Você ainda não tem compras registradas.");
      return;
    }

    const message = purchases
      .slice(0, 5)
      .map((p) => `🛒 ${p.description}: R$${p.total.toFixed(2)} em ${p.date.toLocaleDateString()}`)
      .join("\n");

    await ctx.reply(`📋 Suas últimas compras:\n\n${message}`);
  }

  private isPhotoMessage(message: Message | undefined): message is Message.PhotoMessage {
    return !!message && "photo" in message;
  }
}
