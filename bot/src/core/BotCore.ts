import { inject, injectable } from "inversify";
import { IncomingMessage, Platform } from "./IncomingMessage";
import { Replier } from "./Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { BudgetService } from "../services/BudgetService";
import { ReminderService } from "../services/ReminderService";
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
import { Language } from "../models/User";
import { t } from "../i18n";
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
    @inject(BudgetService) private budgetService: BudgetService,
    @inject(ReminderService) private reminderService: ReminderService,
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

    await this.savePurchase(reply, platform, externalId, purchaseData);
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
      await this.savePurchase(reply, platform, externalId, pending);
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

  private async savePurchase(
    reply: Replier,
    platform: Platform,
    externalId: string,
    purchaseData: IPurchaseCreate,
  ): Promise<void> {
    try {
      await this.purchaseService.addPurchase(purchaseData);

      // Alertas de orçamento (se a categoria desta compra tiver limite definido).
      const alerts = await this.budgetService.alertsForPurchase(platform, externalId, purchaseData);
      const suffix = alerts.length ? `\n\n${alerts.join("\n")}` : "";

      await reply.text(
        `🛒 Compra registrada: ${purchaseData.description} - Total de R$ ${purchaseData.total.toFixed(2)}${suffix}`,
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
        return this.handleGetPurchases(reply, externalId, this.parsePage(args[0]));

      case "excluir":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleDeletePurchase(reply, externalId, args[0]);

      case "editar":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleEditPurchase(reply, externalId, args);

      case "categorias":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleCategories(reply, platform, externalId, args);

      case "orcamento":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleBudgets(reply, platform, externalId, args);

      case "lembretes":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleReminders(reply, platform, externalId, args);

      case "idioma":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleSetLanguage(reply, platform, externalId, args[0]);

      case "ia":
        if (!(await this.requireRegistered(reply, platform, externalId))) return;
        return this.handleSetIAModel(reply, platform, externalId, args[0]);
    }
  }

  // ---------- Editar / excluir compras (A2) ----------

  // Resolve o n-ésimo item (1-based) na ordem de /compras (numeração absoluta, todas as páginas).
  private async nthRecentPurchase(userId: string, nStr: string) {
    const n = Number(nStr);
    if (!Number.isInteger(n) || n < 1) return null;
    const all = await this.purchaseService.getUserPurchases(userId);
    return all[n - 1] ?? null;
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

  // ---------- Idioma (A4) ----------

  private async handleSetLanguage(
    reply: Replier,
    platform: Platform,
    externalId: string,
    langArg?: string,
  ): Promise<void> {
    const lang = (langArg ?? "").toLowerCase();
    if (lang !== "pt" && lang !== "en" && lang !== "es") {
      await reply.text("Use: /idioma pt | en | es");
      return;
    }
    await this.userService.setLanguage(platform, externalId, lang as Language);
    await reply.text(t(lang as Language, "language_set"));
  }

  // ---------- Categorias personalizadas (A3) ----------

  private async handleCategories(
    reply: Replier,
    platform: Platform,
    externalId: string,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();
    const name = args.slice(1).join(" ").trim();

    if (sub === "add" || sub === "adicionar") {
      if (!name) {
        await reply.text('Uso: /categorias add <nome>. Ex.: "/categorias add Mercado".');
        return;
      }
      const cats = await this.userService.addCategory(platform, externalId, name);
      await reply.text(`✅ Categoria adicionada.\n📂 Suas categorias: ${cats.join(", ")}`);
      return;
    }

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      if (!name) {
        await reply.text("Uso: /categorias remover <nome>.");
        return;
      }
      const cats = await this.userService.removeCategory(platform, externalId, name);
      const list = cats.length ? cats.join(", ") : "(usando as padrão)";
      await reply.text(`🗑️ Categoria removida.\n📂 Suas categorias: ${list}`);
      return;
    }

    // Sem subcomando: lista.
    const cats = await this.userService.getCategories(platform, externalId);
    if (cats.length === 0) {
      await reply.text(
        'Você usa as categorias padrão. Crie as suas com "/categorias add Mercado".',
      );
      return;
    }
    await reply.text(
      `📂 Suas categorias: ${cats.join(", ")}\n\n"/categorias add <nome>" ou "/categorias remover <nome>".`,
    );
  }

  // ---------- Orçamento mensal (alertas em savePurchase) ----------

  private async handleBudgets(
    reply: Replier,
    platform: Platform,
    externalId: string,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      const category = args.slice(1).join(" ").trim();
      if (!category) {
        await reply.text("Uso: /orcamento remover <categoria>.");
        return;
      }
      const budgets = await this.userService.removeBudget(platform, externalId, category);
      const list = budgets.length
        ? budgets.map((b) => `• ${b.category}: R$ ${b.limit.toFixed(2)}`).join("\n")
        : "(nenhum)";
      await reply.text(`🗑️ Orçamento removido.\n💰 Seus orçamentos:\n${list}`);
      return;
    }

    // Definir: "/orcamento <categoria...> <valor>". O último token é o limite.
    if (args.length >= 2) {
      const limit = Number(args[args.length - 1].replace(",", "."));
      const category = args.slice(0, -1).join(" ").trim();
      if (!category || !Number.isFinite(limit) || limit <= 0) {
        await reply.text('Uso: /orcamento <categoria> <valor>. Ex.: "/orcamento Alimentação 500".');
        return;
      }
      await this.userService.setBudget(platform, externalId, category, limit);
      await reply.text(
        `✅ Orçamento de ${category} definido em R$ ${limit.toFixed(2)} por mês. Eu te aviso ao chegar perto.`,
      );
      return;
    }

    // Sem argumentos: lista os orçamentos com o gasto do mês atual.
    const budgets = await this.userService.getBudgets(platform, externalId);
    if (budgets.length === 0) {
      await reply.text(
        'Você ainda não tem orçamentos. Crie com "/orcamento Alimentação 500" (limite mensal por categoria).',
      );
      return;
    }

    const report = await this.purchaseService.getSpendingReport(externalId, "current_month");
    const lines = budgets.map((b) => {
      const spent = Object.entries(report.byCategory)
        .filter(([k]) => k.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, [, v]) => sum + v, 0);
      const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return `• ${b.category}: R$ ${spent.toFixed(2)} de R$ ${b.limit.toFixed(2)} (${pct}%)`;
    });

    await reply.text(
      `💰 Orçamentos deste mês:\n${lines.join("\n")}\n\n` +
        '"/orcamento <categoria> <valor>" para alterar, "/orcamento remover <categoria>".',
    );
  }

  // ---------- Lembretes (push recorrente; entrega via ReminderScheduler) ----------

  private async handleReminders(
    reply: Replier,
    platform: Platform,
    externalId: string,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();

    if (sub === "add" || sub === "adicionar") {
      const day = Number(args[1]);
      const description = args.slice(2).join(" ").trim();
      if (!Number.isInteger(day) || day < 1 || day > 28 || !description) {
        await reply.text(
          'Uso: /lembretes add <dia 1-28> <descrição>. Ex.: "/lembretes add 10 Conta de luz".',
        );
        return;
      }
      const reminder = await this.reminderService.add(platform, externalId, day, description);
      await reply.text(
        `⏰ Lembrete criado: "${reminder.description}" — todo dia ${reminder.dayOfMonth}. Eu te aviso por aqui.`,
      );
      return;
    }

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      const removed = await this.reminderService.removeNth(platform, externalId, args[1] ?? "");
      if (!removed) {
        await reply.text("Número inválido. Use /lembretes para ver a lista.");
        return;
      }
      await reply.text(`🗑️ Lembrete removido: "${removed.description}".`);
      return;
    }

    // Sem subcomando: lista.
    const list = await this.reminderService.list(platform, externalId);
    if (list.length === 0) {
      await reply.text(
        'Você não tem lembretes. Crie com "/lembretes add 10 Conta de luz" (dia do mês + descrição).',
      );
      return;
    }
    const body = list.map((r, i) => `${i + 1}. dia ${r.dayOfMonth} — ${r.description}`).join("\n");
    await reply.text(
      `⏰ Seus lembretes:\n\n${body}\n\n` +
        '"/lembretes add <dia> <descrição>" ou "/lembretes remover <nº>".',
    );
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

  private parsePage(arg?: string): number {
    const n = Number(arg);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }

  private async handleGetPurchases(reply: Replier, userId: string, page = 1): Promise<void> {
    const pageSize = 5;
    const {
      items,
      total,
      pages,
      page: current,
    } = await this.purchaseService.getUserPurchasesPage(userId, page, pageSize);

    if (total === 0) {
      await reply.text("Você ainda não tem compras registradas.");
      return;
    }

    const offset = (current - 1) * pageSize;
    const body = items
      .map(
        (p, i) =>
          `${offset + i + 1}. ${p.description}: R$ ${p.total.toFixed(2)} em ${p.date.toLocaleDateString()}`,
      )
      .join("\n");

    let footer = `\n\n📄 Página ${current}/${pages} — ${total} compra(s) no total.`;
    if (current < pages) {
      footer += `\nVer mais: "/compras ${current + 1}".`;
    }
    footer += '\nPara corrigir: "/editar 2 total 10" ou "/excluir 2".';

    await reply.text(`📋 Suas compras:\n\n${body}${footer}`);
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
