import { inject, injectable } from "inversify";
import { IncomingMessage, Platform } from "./IncomingMessage";
import { Replier } from "./Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { QrService } from "../services/QrService";
import { BudgetService } from "../services/BudgetService";
import { ReminderService } from "../services/ReminderService";
import { MergeService } from "../services/MergeService";
import { LinkTokenService } from "../services/LinkTokenService";
import { AuthService } from "../services/AuthService";
import { PlanService } from "../services/PlanService";
import { ExportService } from "../services/ExportService";
import { AccountService } from "../services/AccountService";
import { RateLimiter } from "../services/RateLimiter";
import { isValidEmail } from "../utils/validation";
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
import { IUser, Language, Plan } from "../models/User";
import { extractAccessKey, isValidAccessKey } from "../utils/fiscalKey";
import { MessageKey, t } from "../i18n";
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

// Idioma do usuário (default "pt") — usado para localizar as respostas fixas do bot.
function langOf(user: Pick<IUser, "language"> | null | undefined): Language {
  return user?.language ?? "pt";
}

// Símbolo de moeda por idioma (pt usa R$; en/es usam $ neste MVP).
function currency(lang: Language): string {
  return lang === "pt" ? "R$" : "$";
}

// Lógica de conversa do bot, independente de plataforma. Recebe uma IncomingMessage
// normalizada e um Replier; os adapters cuidam do transporte (Telegram, WhatsApp, ...).
@injectable()
export class BotCore {
  // Compras aguardando confirmação, por usuário (chave "platform:externalId").
  private readonly pendingPurchases = new Map<string, IPurchaseCreate>();
  // E-mails aguardando verificação por código (Magic Auth), por usuário.
  private readonly pendingEmailVerification = new Map<string, string>();

  constructor(
    @inject(UserService) private userService: UserService,
    @inject(OcrService) private ocrService: OcrService,
    @inject(PurchaseService) private purchaseService: PurchaseService,
    @inject(QrService) private qrService: QrService,
    @inject(BudgetService) private budgetService: BudgetService,
    @inject(ReminderService) private reminderService: ReminderService,
    @inject(MergeService) private mergeService: MergeService,
    @inject(LinkTokenService) private linkTokens: LinkTokenService,
    @inject(AuthService) private authService: AuthService,
    @inject(PlanService) private planService: PlanService,
    @inject(ExportService) private exportService: ExportService,
    @inject(AccountService) private accountService: AccountService,
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

  // Idioma do usuário sem um documento em mãos (DB lookup leve).
  private async resolveLang(platform: Platform, externalId: string): Promise<Language> {
    const user = await this.userService.findByIdentity(platform, externalId);
    return langOf(user);
  }

  // No WhatsApp o externalId É o número verificado pela plataforma → registra como telefone
  // verificado e tenta auto-vincular com uma conta existente do mesmo número (Fase 6).
  private async autoLinkWhatsappPhone(platform: Platform, externalId: string): Promise<void> {
    if (platform !== "whatsapp") return;
    await this.mergeService.linkVerifiedPhone(platform, externalId, externalId);
  }

  // ---------- Onboarding / cadastro ----------

  private async handleText(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    if (!this.rateLimiter.allow(externalId)) {
      // Só consulta o idioma quando realmente bloqueia (caminho raro).
      await reply.text(t(await this.resolveLang(platform, externalId), "rate_limited"));
      return;
    }

    const user = await this.userService.findByIdentity(platform, externalId);
    const lang = langOf(user);

    if (!user) {
      // Primeiro contato: aproveita o perfil (nome) quando a plataforma fornece.
      const { user: created, question } = await this.userService.ensureUser(
        platform,
        externalId,
        msg.profile,
        lang,
      );
      await reply.text(
        t(langOf(created), "greeting_new", {
          name: created.name ? `, ${created.name}` : "",
          question,
        }),
        { requestPhone: created.status !== "complete" },
      );
      await this.autoLinkWhatsappPhone(platform, externalId);
      return;
    }

    // Em cadastro: a mensagem é a resposta da etapa atual (nome ou e-mail).
    if (user.status !== "complete") {
      const { reply: answer, completed } = await this.userService.submitAnswer(
        platform,
        externalId,
        msg.text ?? "",
        lang,
      );
      await reply.text(answer, { requestPhone: !completed });
      return;
    }

    // Se há uma compra aguardando confirmação, interpreta esta mensagem como a resposta.
    if (await this.resolvePendingConfirmation(reply, platform, externalId, lang, msg.text ?? "")) {
      return;
    }

    const userId = String(user._id); // identidade canônica (Fase 6)
    const plan = user.plan ?? "free";
    const processed = await this.messageProcessingService.processMessage(
      platform,
      externalId,
      msg.text ?? "",
    );
    await this.handleProcessed(reply, platform, externalId, userId, lang, plan, processed);
  }

  private async handleContact(msg: IncomingMessage, reply: Replier): Promise<void> {
    if (!msg.contact) return;
    const lang = await this.resolveLang(msg.platform, msg.externalId);
    const { reply: answer, completed } = await this.userService.saveContact(
      msg.platform,
      msg.externalId,
      msg.contact.phone,
      msg.contact.name,
      lang,
    );
    await reply.text(answer, { requestPhone: !completed });
    // Telefone compartilhado é verificado pela plataforma → registra e tenta auto-vincular (Fase 6).
    if (msg.contact.phone) {
      await this.mergeService.linkVerifiedPhone(msg.platform, msg.externalId, msg.contact.phone);
    }
  }

  // Garante o cadastro completo antes de um comando. Conduz o cadastro e retorna o usuário
  // completo, ou null (já respondendo com a próxima pergunta do cadastro).
  private async requireRegistered(
    reply: Replier,
    platform: Platform,
    externalId: string,
  ): Promise<IUser | null> {
    const user = await this.userService.findByIdentity(platform, externalId);
    if (user && user.status === "complete") {
      return user;
    }
    const lang = langOf(user);
    const { question } = await this.userService.ensureUser(platform, externalId, undefined, lang);
    await reply.text(t(lang, "finish_registration", { question }), { requestPhone: true });
    return null;
  }

  // ---------- Foto ----------

  private async handlePhoto(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    if (!this.rateLimiter.allow(externalId)) {
      await reply.text(t(await this.resolveLang(platform, externalId), "rate_limited"));
      return;
    }
    const user = await this.requireRegistered(reply, platform, externalId);
    if (!user) return;
    const lang = langOf(user);
    const userId = String(user._id);
    const plan = user.plan ?? "free";

    try {
      const base64Image = msg.getImageBase64 ? await msg.getImageBase64() : "";
      const processed = await this.processReceiptImage(platform, externalId, base64Image);
      await this.handleProcessed(reply, platform, externalId, userId, lang, plan, processed);
    } catch (error) {
      logger.error({ err: error }, "Erro ao baixar/processar a imagem");
      await reply.text(t(lang, "photo_error"));
    }
  }

  // OCR_MODE=multimodal: imagem → JSON numa única chamada. Senão: OCR → texto → extração.
  // Depois, enriquece com a chave de acesso da NFC-e (IA + fallback de QR).
  private async processReceiptImage(
    platform: Platform,
    externalId: string,
    base64Image: string,
  ): Promise<ModelResponse> {
    const processed = await this.extractFromImage(platform, externalId, base64Image);
    return this.enrichFiscalKey(processed, base64Image);
  }

  private async extractFromImage(
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

  // Resolve a chave de acesso (NFC-e): tenta a que a IA leu no texto; se não vier válida,
  // decodifica o QR Code da imagem. Mantém apenas chaves com dígito verificador correto.
  private async enrichFiscalKey(
    processed: ModelResponse,
    base64Image: string,
  ): Promise<ModelResponse> {
    if (processed.intent !== "purchase") return processed;

    let key = extractAccessKey(processed.accessKey);
    if (!key || !isValidAccessKey(key)) {
      const qrText = await this.qrService.decode(base64Image);
      key = extractAccessKey(qrText);
    }
    processed.accessKey = key && isValidAccessKey(key) ? key : undefined;
    return processed;
  }

  // ---------- Roteamento da resposta da IA ----------

  private async handleProcessed(
    reply: Replier,
    platform: Platform,
    externalId: string,
    userId: string,
    lang: Language,
    plan: Plan,
    processed: ModelResponse,
  ): Promise<void> {
    if (processed.intent === "query") {
      await this.handleSpendingQuery(reply, userId, lang, processed.period, processed.groupBy);
      return;
    }

    if (processed.intent !== "purchase") {
      // processed.message vem da IA já no idioma do usuário; senão, fallback localizado.
      await reply.text(processed.message || t(lang, "not_understood"));
      return;
    }

    const purchaseData = convertModelResponseToPurchase(processed);
    purchaseData.userId = userId; // garante a identidade canônica (Fase 6)

    // Deduplicação de cupom fiscal (NFC-e): não registra o mesmo cupom duas vezes.
    if (purchaseData.fiscalKey) {
      const existing = await this.purchaseService.findByFiscalKey(userId, purchaseData.fiscalKey);
      if (existing) {
        await reply.text(t(lang, "receipt_already_registered"));
        return;
      }
    }

    // Limite do plano free (compras/mês). Pro é ilimitado.
    if (!(await this.planService.canRegister(userId, plan))) {
      await reply.text(t(lang, "plan_limit_reached", { limit: this.planService.freeLimit }));
      return;
    }

    const validation = validatePurchaseData(purchaseData);
    if (!validation.ok) {
      await reply.text(`❌ ${validation.reason}`);
      return;
    }

    // Confirmação antes de salvar: guarda a pendente e pede "sim/não".
    if (config.confirmPurchase) {
      this.pendingPurchases.set(this.pendingKey(platform, externalId), purchaseData);
      await reply.text(
        t(lang, "purchase_confirm", {
          description: purchaseData.description,
          total: purchaseData.total.toFixed(2),
        }),
      );
      return;
    }

    await this.savePurchase(reply, platform, externalId, lang, purchaseData);
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
    lang: Language,
    text: string,
  ): Promise<boolean> {
    const key = this.pendingKey(platform, externalId);
    const pending = this.pendingPurchases.get(key);
    if (!pending) return false;

    const answer = text.trim().toLowerCase();

    if (AFFIRMATIVE.has(answer)) {
      this.pendingPurchases.delete(key);
      await this.savePurchase(reply, platform, externalId, lang, pending);
      return true;
    }
    if (NEGATIVE.has(answer)) {
      this.pendingPurchases.delete(key);
      await reply.text(t(lang, "purchase_cancelled"));
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
    lang: Language,
    purchaseData: IPurchaseCreate,
  ): Promise<void> {
    try {
      await this.purchaseService.addPurchase(purchaseData);

      // Alertas de orçamento (se a categoria desta compra tiver limite definido).
      const alerts = await this.budgetService.alertsForPurchase(
        platform,
        externalId,
        purchaseData,
        lang,
      );
      const suffix = alerts.length ? `\n\n${alerts.join("\n")}` : "";

      await reply.text(
        t(lang, "purchase_saved", {
          description: purchaseData.description,
          total: purchaseData.total.toFixed(2),
        }) + suffix,
      );
    } catch (error) {
      logger.error({ err: error }, "Erro ao registrar compra");
      await reply.text(t(lang, "purchase_save_error"));
    }
  }

  // ---------- Comandos ----------

  private async handleCommand(msg: IncomingMessage, reply: Replier): Promise<void> {
    const { platform, externalId } = msg;
    const name = msg.command?.name;
    const args = msg.command?.args ?? [];

    if (name === "start") {
      return this.handleStart(msg, reply);
    }

    // /vincular não exige cadastro: cria a identidade e funde na conta do token.
    if (name === "vincular") {
      return this.handleLink(msg, reply, args[0] ?? "");
    }

    const user = await this.requireRegistered(reply, platform, externalId);
    if (!user) return;
    const lang = langOf(user);
    const userId = String(user._id); // identidade canônica (Fase 6)

    switch (name) {
      case "gastos":
        return this.handleSpendingQuery(reply, userId, lang, "current_month");
      case "compras":
        return this.handleGetPurchases(reply, lang, userId, this.parsePage(args[0]));
      case "exportar":
        return this.handleExport(reply, lang, userId);
      case "excluir_conta":
        return this.handleDeleteAccount(reply, lang, user, args[0]);
      case "excluir":
        return this.handleDeletePurchase(reply, lang, userId, args[0]);
      case "editar":
        return this.handleEditPurchase(reply, lang, userId, args);
      case "categorias":
        return this.handleCategories(reply, platform, externalId, lang, args);
      case "orcamento":
        return this.handleBudgets(reply, platform, externalId, userId, lang, args);
      case "lembretes":
        return this.handleReminders(reply, platform, externalId, lang, args);
      case "idioma":
        return this.handleSetLanguage(reply, platform, externalId, lang, args[0]);
      case "email":
        return this.handleEmail(reply, platform, externalId, lang, args[0]);
      case "codigo":
        return this.handleEmailCode(reply, platform, externalId, lang, args[0]);
      case "ia":
        return this.handleSetIAModel(reply, platform, externalId, lang, args[0]);
    }
  }

  // ---------- Verificação de e-mail no chat (Magic Auth — Parte 4) ----------

  private async handleEmail(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    emailArg?: string,
  ): Promise<void> {
    if (!this.authService.canVerifyEmail()) {
      await reply.text(t(lang, "verification_unavailable"));
      return;
    }
    const email = (emailArg ?? "").trim().toLowerCase();
    if (!email) {
      await reply.text(t(lang, "email_usage"));
      return;
    }
    if (!isValidEmail(email)) {
      await reply.text(t(lang, "email_invalid_address"));
      return;
    }

    try {
      await this.authService.sendEmailCode(email);
      this.pendingEmailVerification.set(this.pendingKey(platform, externalId), email);
      await reply.text(t(lang, "email_sent", { email }));
    } catch (error) {
      logger.error({ err: error }, "Falha ao enviar código de verificação de e-mail");
      await reply.text(t(lang, "verification_unavailable"));
    }
  }

  private async handleEmailCode(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    codeArg?: string,
  ): Promise<void> {
    const key = this.pendingKey(platform, externalId);
    const email = this.pendingEmailVerification.get(key);
    if (!email) {
      await reply.text(t(lang, "code_no_pending"));
      return;
    }
    const code = (codeArg ?? "").trim();
    if (!code) {
      await reply.text(t(lang, "code_usage"));
      return;
    }

    const ok = await this.authService.verifyEmailCode(email, code);
    if (!ok) {
      await reply.text(t(lang, "code_invalid")); // mantém a pendente para nova tentativa
      return;
    }

    this.pendingEmailVerification.delete(key);
    // E-mail verificado → grava e auto-vincula com a conta web do mesmo e-mail.
    await this.mergeService.linkVerifiedEmail(platform, externalId, email);
    await reply.text(t(lang, "email_verified"));
  }

  // ---------- Editar / excluir compras (A2) ----------

  // Resolve o n-ésimo item (1-based) na ordem de /compras (numeração absoluta, todas as páginas).
  private async nthRecentPurchase(userId: string, nStr: string) {
    const n = Number(nStr);
    if (!Number.isInteger(n) || n < 1) return null;
    const all = await this.purchaseService.getUserPurchases(userId);
    return all[n - 1] ?? null;
  }

  private async handleDeletePurchase(
    reply: Replier,
    lang: Language,
    userId: string,
    nStr: string,
  ): Promise<void> {
    const target = await this.nthRecentPurchase(userId, nStr);
    if (!target) {
      await reply.text(t(lang, "delete_invalid"));
      return;
    }
    await this.purchaseService.deletePurchase(userId, String(target._id));
    await reply.text(
      t(lang, "delete_done", { description: target.description, total: target.total.toFixed(2) }),
    );
  }

  private async handleEditPurchase(
    reply: Replier,
    lang: Language,
    userId: string,
    args: string[],
  ): Promise<void> {
    const field = (args[1] ?? "").toLowerCase();
    const value = args.slice(2).join(" ").trim();
    const target = await this.nthRecentPurchase(userId, args[0] ?? "");

    if (!target || !field || !value) {
      await reply.text(t(lang, "edit_usage"));
      return;
    }

    const patch: { total?: number; description?: string } = {};
    if (field === "total" || field === "valor") {
      const v = Number(value.replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) {
        await reply.text(t(lang, "edit_invalid_value"));
        return;
      }
      patch.total = v;
    } else if (field === "descrição" || field === "descricao" || field === "desc") {
      patch.description = value;
    } else {
      await reply.text(t(lang, "edit_invalid_field"));
      return;
    }

    const updated = await this.purchaseService.updatePurchase(userId, String(target._id), patch);
    if (!updated) {
      await reply.text(t(lang, "edit_failed"));
      return;
    }
    await reply.text(
      t(lang, "edit_done", { description: updated.description, total: updated.total.toFixed(2) }),
    );
  }

  // ---------- Idioma (A4) ----------

  private async handleSetLanguage(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    langArg?: string,
  ): Promise<void> {
    const chosen = (langArg ?? "").toLowerCase();
    if (chosen !== "pt" && chosen !== "en" && chosen !== "es") {
      await reply.text(t(lang, "language_usage"));
      return;
    }
    await this.userService.setLanguage(platform, externalId, chosen as Language);
    await reply.text(t(chosen as Language, "language_set"));
  }

  // ---------- Categorias personalizadas (A3) ----------

  private async handleCategories(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();
    const name = args.slice(1).join(" ").trim();

    if (sub === "add" || sub === "adicionar") {
      if (!name) {
        await reply.text(t(lang, "categories_add_usage"));
        return;
      }
      const cats = await this.userService.addCategory(platform, externalId, name);
      await reply.text(t(lang, "categories_added", { list: cats.join(", ") }));
      return;
    }

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      if (!name) {
        await reply.text(t(lang, "categories_remove_usage"));
        return;
      }
      const cats = await this.userService.removeCategory(platform, externalId, name);
      const list = cats.length ? cats.join(", ") : t(lang, "categories_default_label");
      await reply.text(t(lang, "categories_removed", { list }));
      return;
    }

    // Sem subcomando: lista.
    const cats = await this.userService.getCategories(platform, externalId);
    if (cats.length === 0) {
      await reply.text(t(lang, "categories_default_hint"));
      return;
    }
    await reply.text(t(lang, "categories_list", { list: cats.join(", ") }));
  }

  // ---------- Orçamento mensal (alertas em savePurchase) ----------

  private async handleBudgets(
    reply: Replier,
    platform: Platform,
    externalId: string,
    userId: string,
    lang: Language,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();
    const cur = currency(lang);

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      const category = args.slice(1).join(" ").trim();
      if (!category) {
        await reply.text(t(lang, "budget_remove_usage"));
        return;
      }
      const budgets = await this.userService.removeBudget(platform, externalId, category);
      const list = budgets.length
        ? budgets.map((b) => `• ${b.category}: ${cur} ${b.limit.toFixed(2)}`).join("\n")
        : t(lang, "budget_none_label");
      await reply.text(t(lang, "budget_removed", { list }));
      return;
    }

    // Definir: "/orcamento <categoria...> <valor>". O último token é o limite.
    if (args.length >= 2) {
      const limit = Number(args[args.length - 1].replace(",", "."));
      const category = args.slice(0, -1).join(" ").trim();
      if (!category || !Number.isFinite(limit) || limit <= 0) {
        await reply.text(t(lang, "budget_set_usage"));
        return;
      }
      await this.userService.setBudget(platform, externalId, category, limit);
      await reply.text(t(lang, "budget_set", { category, limit: limit.toFixed(2) }));
      return;
    }

    // Sem argumentos: lista os orçamentos com o gasto do mês atual.
    const budgets = await this.userService.getBudgets(platform, externalId);
    if (budgets.length === 0) {
      await reply.text(t(lang, "budget_empty"));
      return;
    }

    const report = await this.purchaseService.getSpendingReport(userId, "current_month");
    const lines = budgets.map((b) => {
      const spent = Object.entries(report.byCategory)
        .filter(([k]) => k.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, [, v]) => sum + v, 0);
      const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return `• ${b.category}: ${cur} ${spent.toFixed(2)} / ${cur} ${b.limit.toFixed(2)} (${pct}%)`;
    });

    await reply.text(
      `${t(lang, "budget_list_header")}\n${lines.join("\n")}\n\n${t(lang, "budget_list_footer")}`,
    );
  }

  // ---------- Lembretes (push recorrente; entrega via ReminderScheduler) ----------

  private async handleReminders(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    args: string[],
  ): Promise<void> {
    const sub = (args[0] ?? "").toLowerCase();

    if (sub === "add" || sub === "adicionar") {
      const day = Number(args[1]);
      const description = args.slice(2).join(" ").trim();
      if (!Number.isInteger(day) || day < 1 || day > 28 || !description) {
        await reply.text(t(lang, "reminder_add_usage"));
        return;
      }
      const reminder = await this.reminderService.add(platform, externalId, day, description, lang);
      await reply.text(
        t(lang, "reminder_created", {
          description: reminder.description,
          day: reminder.dayOfMonth,
        }),
      );
      return;
    }

    if (sub === "remover" || sub === "remove" || sub === "rm" || sub === "del") {
      const removed = await this.reminderService.removeNth(platform, externalId, args[1] ?? "");
      if (!removed) {
        await reply.text(t(lang, "reminder_remove_invalid"));
        return;
      }
      await reply.text(t(lang, "reminder_removed", { description: removed.description }));
      return;
    }

    // Sem subcomando: lista.
    const list = await this.reminderService.list(platform, externalId);
    if (list.length === 0) {
      await reply.text(t(lang, "reminder_empty"));
      return;
    }
    const body = list
      .map((r, i) =>
        t(lang, "reminder_list_item", {
          index: i + 1,
          day: r.dayOfMonth,
          description: r.description,
        }),
      )
      .join("\n");
    await reply.text(
      `${t(lang, "reminder_list_header")}\n\n${body}\n\n${t(lang, "reminder_list_footer")}`,
    );
  }

  // ---------- Vínculo de contas por deep-link (Fase 6) ----------

  // Consome o token de vínculo e funde a identidade atual na conta canônica (web).
  private async tryLink(platform: Platform, externalId: string, token: string): Promise<boolean> {
    const canonicalUserId = this.linkTokens.consume(token);
    if (!canonicalUserId) return false;
    return this.mergeService.linkAccounts(platform, externalId, canonicalUserId);
  }

  // /vincular <token> (WhatsApp/Web/Telegram). Não exige cadastro: garante a identidade e funde.
  private async handleLink(msg: IncomingMessage, reply: Replier, token: string): Promise<void> {
    const { platform, externalId } = msg;
    const lang = await this.resolveLang(platform, externalId);
    await this.userService.ensureUser(platform, externalId, msg.profile, lang);
    const linked = token ? await this.tryLink(platform, externalId, token) : false;
    await reply.text(t(lang, linked ? "link_success" : "link_invalid"));
  }

  private async handleStart(msg: IncomingMessage, reply: Replier): Promise<void> {
    // Resolve o idioma antes para localizar já a saudação/pergunta.
    const lang = await this.resolveLang(msg.platform, msg.externalId);
    const { user, question } = await this.userService.ensureUser(
      msg.platform,
      msg.externalId,
      msg.profile,
      lang,
    );
    const userLang = langOf(user);
    const name = user.name ? `, ${user.name}` : "";

    // No WhatsApp o número já é verificado → registra/auto-vincula (Fase 6).
    await this.autoLinkWhatsappPhone(msg.platform, msg.externalId);

    // Deep-link do Telegram: /start carrega o token de vínculo no payload.
    const startToken = msg.command?.args?.[0] ?? "";
    if (startToken) {
      const linked = await this.tryLink(msg.platform, msg.externalId, startToken);
      await reply.text(t(userLang, linked ? "link_success" : "link_invalid"));
      return;
    }

    if (user.status === "complete") {
      await reply.text(t(userLang, "greeting_returning", { name }));
      return;
    }

    await reply.text(t(userLang, "greeting_new", { name, question }), { requestPhone: true });
  }

  private async handleSetIAModel(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    model?: string,
  ): Promise<void> {
    if (!model) {
      await reply.text(t(lang, "ia_usage"));
      return;
    }
    const response = await this.messageProcessingService.setUserModel(
      platform,
      externalId,
      model.toLowerCase(),
      lang,
    );
    await reply.text(response);
  }

  private parsePage(arg?: string): number {
    const n = Number(arg);
    return Number.isInteger(n) && n > 0 ? n : 1;
  }

  private async handleGetPurchases(
    reply: Replier,
    lang: Language,
    userId: string,
    page = 1,
  ): Promise<void> {
    const pageSize = 5;
    const cur = currency(lang);
    const {
      items,
      total,
      pages,
      page: current,
    } = await this.purchaseService.getUserPurchasesPage(userId, page, pageSize);

    if (total === 0) {
      await reply.text(t(lang, "purchases_empty"));
      return;
    }

    const offset = (current - 1) * pageSize;
    const body = items
      .map((p, i) =>
        t(lang, "purchases_item", {
          index: offset + i + 1,
          description: p.description,
          total: `${cur} ${p.total.toFixed(2)}`,
          date: p.date.toLocaleDateString(),
        }),
      )
      .join("\n");

    let footer = `\n\n${t(lang, "purchases_page_info", { current, pages, total })}`;
    if (current < pages) {
      footer += `\n${t(lang, "purchases_more", { next: current + 1 })}`;
    }
    footer += `\n${t(lang, "purchases_fix_hint")}`;

    await reply.text(`${t(lang, "purchases_header")}\n\n${body}${footer}`);
  }

  // ---------- Exclusão de conta (LGPD) ----------

  private async handleDeleteAccount(
    reply: Replier,
    lang: Language,
    user: IUser,
    confirmArg?: string,
  ): Promise<void> {
    if ((confirmArg ?? "").toLowerCase() !== "confirmar") {
      await reply.text(t(lang, "account_delete_warn"));
      return;
    }
    await this.accountService.deleteAccount(user);
    await reply.text(t(lang, "account_deleted"));
  }

  // ---------- Exportação (CSV) ----------

  private async handleExport(reply: Replier, lang: Language, userId: string): Promise<void> {
    if (!reply.document) {
      await reply.text(t(lang, "export_unavailable"));
      return;
    }
    const csv = await this.exportService.purchasesCsv(userId);
    if (csv.split("\n").length <= 1) {
      await reply.text(t(lang, "export_empty"));
      return;
    }
    await reply.document(Buffer.from(csv, "utf8"), "alfred-compras.csv", "text/csv");
    await reply.text(t(lang, "export_done"));
  }

  // ---------- Consulta de gastos ----------

  private async handleSpendingQuery(
    reply: Replier,
    userId: string,
    lang: Language,
    period: SpendingPeriod = "current_month",
    groupBy?: SpendingGroupBy,
  ): Promise<void> {
    const report = await this.purchaseService.getSpendingReport(userId, period);
    const periodLabel = this.periodLabel(report.period, lang);

    if (report.count === 0) {
      await reply.text(t(lang, "spending_empty", { period: periodLabel }));
      return;
    }

    let message = t(lang, "spending_report", {
      period: periodLabel,
      total: report.total.toFixed(2),
      count: report.count,
    });

    if (groupBy === "category") {
      message += this.formatBreakdown(t(lang, "breakdown_category"), report.byCategory, lang);
    } else if (groupBy === "store") {
      message += this.formatBreakdown(t(lang, "breakdown_store"), report.byStore, lang);
    }

    await reply.text(message);
  }

  private periodLabel(period: SpendingPeriod, lang: Language): string {
    const key: MessageKey =
      period === "last_month"
        ? "period_last_month"
        : period === "all"
          ? "period_all"
          : "period_current_month";
    return t(lang, key);
  }

  private formatBreakdown(title: string, data: Record<string, number>, lang: Language): string {
    const cur = currency(lang);
    const lines = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => `• ${key}: ${cur} ${value.toFixed(2)}`);

    if (lines.length === 0) {
      return "";
    }
    return `\n\n${title}:\n${lines.join("\n")}`;
  }
}
