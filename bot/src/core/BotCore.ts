import { inject, injectable } from "inversify";
import { IncomingMessage, Platform } from "./IncomingMessage";
import { Replier } from "./Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { RateLimiter } from "../services/RateLimiter";
import {
  MessageProcessingService,
  ModelResponse,
  SpendingGroupBy,
  SpendingPeriod,
} from "../services/MessageProcessingService";
import {
  convertModelResponseToPurchase,
  validatePurchaseData,
} from "../infra/converters/purchaseConverter";
import { IPurchaseCreate } from "../models/Purchase";
import { config } from "../infra/config";
import { logger } from "../infra/logger";
import { messagesReceivedTotal } from "../infra/metrics";

// Respostas aceitas na confirmação de compra ("sim/não").
const AFFIRMATIVE = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "confirmar",
  "confirma",
  "ok",
  "isso",
  "👍",
  "✅",
]);
const NEGATIVE = new Set(["não", "nao", "n", "no", "cancelar", "cancela", "cancelado"]);

// Lógica de conversa do bot, independente de plataforma. Recebe uma IncomingMessage
// normalizada e um Replier; os adapters cuidam do transporte (Telegram, WhatsApp, ...).
@injectable()
export class BotCore {
  // Compras aguardando confirmação, por usuário (chave "platform:externalId").
  private readonly pendingPurchases = new Map<string, IPurchaseCreate>();

  constructor(
    @inject(UserService) private userService: UserService,
    @inject(OcrService) private ocrService: OcrService,
    @inject(PurchaseService) private purchaseService: PurchaseService,
    @inject(RateLimiter) private rateLimiter: RateLimiter,
    @inject(MessageProcessingService) private messageProcessingService: MessageProcessingService,
  ) {}

  async handle(msg: IncomingMessage, reply: Replier): Promise<void> {
    messagesReceivedTotal.inc({ platform: msg.platform, kind: msg.kind });

    switch (msg.kind) {
      case "command":
        return this.handleCommand(msg, reply);
      case "contact":
        return this.handleContact(msg, reply);
      case "text":
        return this.handleText(msg, reply);
      case "photo":
        return this.handlePhoto(msg, reply);
    }
  }

  // ---------- Onboarding / cadastro ----------

  private async handleText(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    if (!this.rateLimiter.allow(externalId)) {
      await reply.text(
        "⏳ Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente.",
      );
      return;
    }

    const user = await this.userService.findByIdentity(platform, externalId);

    if (!user) {
      // Primeiro contato: aproveita o perfil (nome) quando a plataforma fornece.
      const { user: created, question } = await this.userService.ensureUser(
        platform,
        externalId,
        msg.profile,
      );
      await reply.text(
        `👋 Olá${created.name ? `, ${created.name}` : ""}! Eu registro suas compras e gastos. ${question}`,
        { requestPhone: created.status !== "complete" },
      );
      return;
    }

    // Em cadastro: a mensagem é a resposta da etapa atual (nome ou e-mail).
    if (user.status !== "complete") {
      const { reply: answer, completed } = await this.userService.submitAnswer(
        platform,
        externalId,
        msg.text ?? "",
      );
      await reply.text(answer, { requestPhone: !completed });
      return;
    }

    // Se há uma compra aguardando confirmação, interpreta esta mensagem como a resposta.
    if (await this.resolvePendingConfirmation(reply, platform, externalId, msg.text ?? "")) {
      return;
    }

    const processed = await this.messageProcessingService.processMessage(
      platform,
      externalId,
      msg.text ?? "",
    );
    await this.handleProcessed(reply, platform, externalId, processed);
  }

  private async handleContact(msg: IncomingMessage, reply: Replier): Promise<void> {
    if (!msg.contact) return;
    const { reply: answer, completed } = await this.userService.saveContact(
      msg.platform,
      msg.externalId,
      msg.contact.phone,
      msg.contact.name,
    );
    await reply.text(answer, { requestPhone: !completed });
  }

  // Garante o cadastro completo antes de um comando. Conduz o cadastro e retorna false se incompleto.
  private async requireRegistered(
    reply: Replier,
    platform: Platform,
    externalId: string,
  ): Promise<boolean> {
    const user = await this.userService.findByIdentity(platform, externalId);
    if (user && user.status === "complete") {
      return true;
    }
    const { question } = await this.userService.ensureUser(platform, externalId);
    await reply.text(`Antes disso, vamos concluir seu cadastro. ${question}`, {
      requestPhone: true,
    });
    return false;
  }

  // ---------- Foto ----------

  private async handlePhoto(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    if (!this.rateLimiter.allow(externalId)) {
      await reply.text(
        "⏳ Muitas mensagens em pouco tempo. Aguarde um instante e tente novamente.",
      );
      return;
    }
    if (!(await this.requireRegistered(reply, platform, externalId))) {
      return;
    }

    try {
      const base64Image = msg.getImageBase64 ? await msg.getImageBase64() : "";
      const processed = await this.processReceiptImage(platform, externalId, base64Image);
      await this.handleProcessed(reply, platform, externalId, processed);
    } catch (error) {
      logger.error({ err: error }, "Erro ao baixar/processar a imagem");
      await reply.text("Houve um erro ao processar a imagem. Tente novamente.");
    }
  }

  // OCR_MODE=multimodal: imagem → JSON numa única chamada. Senão: OCR → texto → extração.
  private async processReceiptImage(
    platform: Platform,
    externalId: string,
    base64Image: string,
  ): Promise<ModelResponse> {
    const multimodal = config.ocrMode === "multimodal";

    if (multimodal) {
      const direct = await this.messageProcessingService.processImage(
        platform,
        externalId,
        base64Image,
      );
      if (direct) {
        return direct;
      }
    }

    const ocrText = await this.ocrService.extractTextFromImage(base64Image);
    return this.messageProcessingService.processMessage(platform, externalId, ocrText);
  }

  // ---------- Roteamento da resposta da IA ----------

  private async handleProcessed(
    reply: Replier,
    platform: Platform,
    externalId: string,
    processed: ModelResponse,
  ): Promise<void> {
    if (processed.intent === "query") {
      await this.handleSpendingQuery(reply, externalId, processed.period, processed.groupBy);
      return;
    }

    if (processed.intent !== "purchase") {
      await reply.text(
        processed.message ||
          "❌ Não consegui identificar os dados. Pode repetir com mais detalhes?",
      );
      return;
    }

    const purchaseData = convertModelResponseToPurchase(processed);

    const validation = validatePurchaseData(purchaseData);
    if (!validation.ok) {
      await reply.text(`❌ ${validation.reason}`);
      return;
    }

    // Confirmação antes de salvar: guarda a pendente e pede "sim/não".
    if (config.confirmPurchase) {
      this.pendingPurchases.set(this.pendingKey(platform, externalId), purchaseData);
      await reply.text(
        `Confirmar esta compra?\n\n🛒 ${purchaseData.description} — R$ ${purchaseData.total.toFixed(2)}\n\nResponda "sim" para salvar ou "não" para cancelar.`,
      );
      return;
    }

    await this.savePurchase(reply, purchaseData);
  }

  // ---------- Confirmação de compra (A1) ----------

  private pendingKey(platform: Platform, externalId: string): string {
    return `${platform}:${externalId}`;
  }

  // Interpreta a mensagem como resposta a uma compra pendente.
  // Retorna true se consumiu a mensagem (salvou/cancelou); false se não havia pendente
  // ou se a resposta não foi sim/não (nesse caso, abandona a pendente e segue o fluxo normal).
  private async resolvePendingConfirmation(
    reply: Replier,
    platform: Platform,
    externalId: string,
    text: string,
  ): Promise<boolean> {
    const key = this.pendingKey(platform, externalId);
    const pending = this.pendingPurchases.get(key);
    if (!pending) return false;

    const answer = text.trim().toLowerCase();

    if (AFFIRMATIVE.has(answer)) {
      this.pendingPurchases.delete(key);
      await this.savePurchase(reply, pending);
      return true;
    }
    if (NEGATIVE.has(answer)) {
      this.pendingPurchases.delete(key);
      await reply.text("Ok, cancelei essa compra. 👍");
      return true;
    }

    // Resposta diferente de sim/não: descarta a pendente e processa a mensagem normalmente.
    this.pendingPurchases.delete(key);
    return false;
  }

  private async savePurchase(reply: Replier, purchaseData: IPurchaseCreate): Promise<void> {
    try {
      await this.purchaseService.addPurchase(purchaseData);
      await reply.text(
        `🛒 Compra registrada: ${purchaseData.description} - Total de R$ ${purchaseData.total.toFixed(2)}`,
      );
    } catch (error) {
      logger.error({ err: error }, "Erro ao registrar compra");
      await reply.text(
        "❌ Não consegui registrar essa compra. Verifique os valores e tente novamente.",
      );
    }
  }

  // ---------- Comandos ----------

  private async handleCommand(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    const name = msg.command?.name;
    const args = msg.command?.args ?? [];

    switch (name) {
      case "start":
        return this.handleStart(msg, reply);

      case "gastos":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleSpendingQuery(reply, externalId, "current_month");

      case "compras":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleGetPurchases(reply, externalId);

      case "excluir":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleDeletePurchase(reply, externalId, args[0]);

      case "editar":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleEditPurchase(reply, externalId, args);

      case "ia":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleSetIAModel(reply, platform, externalId, args[0]);
    }
  }

  // ---------- Editar / excluir compras (A2) ----------

  // Resolve o n-ésimo item (1-based) da lista de últimas compras (mesma ordem de /compras).
  private async nthRecentPurchase(userId: string, nStr: string) {
    const n = Number(nStr);
    if (!Number.isInteger(n) || n < 1) return null;
    const recent = (await this.purchaseService.getUserPurchases(userId)).slice(0, 5);
    return recent[n - 1] ?? null;
  }

  private async handleDeletePurchase(reply: Replier, userId: string, nStr: string): Promise<void> {
    const target = await this.nthRecentPurchase(userId, nStr);
    if (!target) {
      await reply.text('Número inválido. Use /compras para ver a lista (ex.: "/excluir 2").');
      return;
    }
    await this.purchaseService.deletePurchase(userId, String(target._id));
    await reply.text(`🗑️ Excluído: ${target.description} — R$ ${target.total.toFixed(2)}`);
  }

  private async handleEditPurchase(reply: Replier, userId: string, args: string[]): Promise<void> {
    const field = (args[1] ?? "").toLowerCase();
    const value = args.slice(2).join(" ").trim();
    const target = await this.nthRecentPurchase(userId, args[0] ?? "");

    if (!target || !field || !value) {
      await reply.text('Uso: /editar <nº> <total|descrição> <valor>. Ex.: "/editar 2 total 10".');
      return;
    }

    const patch: { total?: number; description?: string } = {};
    if (field === "total" || field === "valor") {
      const v = Number(value.replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) {
        await reply.text("Valor inválido. Ex.: /editar 2 total 10");
        return;
      }
      patch.total = v;
    } else if (field === "descrição" || field === "descricao" || field === "desc") {
      patch.description = value;
    } else {
      await reply.text('Campo inválido. Use "total" ou "descrição".');
      return;
    }

    const updated = await this.purchaseService.updatePurchase(userId, String(target._id), patch);
    if (!updated) {
      await reply.text("Não consegui editar essa compra.");
      return;
    }
    await reply.text(`✏️ Atualizado: ${updated.description} — R$ ${updated.total.toFixed(2)}`);
  }

  private async handleStart(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { user, question } = await this.userService.ensureUser(
      msg.platform,
      msg.externalId,
      msg.profile,
    );

    if (user.status === "complete") {
      await reply.text(
        `Olá de novo${user.name ? `, ${user.name}` : ""}! 👋 Envie uma compra (ex.: "agua 7"), um cupom fiscal, ou use /gastos.`,
      );
      return;
    }

    await reply.text(
      `👋 Olá${user.name ? `, ${user.name}` : ""}! Eu registro suas compras e gastos. ${question}`,
      { requestPhone: true },
    );
  }

  private async handleSetIAModel(
    reply: Replier,
    platform: Platform,
    externalId: string,
    model?: string,
  ): Promise<void> {
    if (!model) {
      await reply.text("Use: /ia gpt ou /ia gemini");
      return;
    }
    const response = await this.messageProcessingService.setUserModel(
      platform,
      externalId,
      model.toLowerCase(),
    );
    await reply.text(response);
  }

  private async handleGetPurchases(reply: Replier, userId: string): Promise<void> {
    const purchases = await this.purchaseService.getUserPurchases(userId);

    if (purchases.length === 0) {
      await reply.text("Você ainda não tem compras registradas.");
      return;
    }

    const message = purchases
      .slice(0, 5)
      .map(
        (p, i) =>
          `${i + 1}. ${p.description}: R$ ${p.total.toFixed(2)} em ${p.date.toLocaleDateString()}`,
      )
      .join("\n");

    await reply.text(
      `📋 Suas últimas compras:\n\n${message}\n\n` +
        'Para corrigir: "/editar 2 total 10" ou "/excluir 2".',
    );
  }

  // ---------- Consulta de gastos ----------

  private async handleSpendingQuery(
    reply: Replier,
    userId: string,
    period: SpendingPeriod = "current_month",
    groupBy?: SpendingGroupBy,
  ): Promise<void> {
    const report = await this.purchaseService.getSpendingReport(userId, period);
    const label = this.periodLabel(report.period);

    if (report.count === 0) {
      await reply.text(`Você não tem gastos registrados ${label}.`);
      return;
    }

    let message = `📊 Gastos ${label}: R$ ${report.total.toFixed(2)} em ${report.count} compra(s).`;

    if (groupBy === "category") {
      message += this.formatBreakdown("Por categoria", report.byCategory);
    } else if (groupBy === "store") {
      message += this.formatBreakdown("Por loja", report.byStore);
    }

    await reply.text(message);
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
}
