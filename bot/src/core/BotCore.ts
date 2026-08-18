import { inject, injectable } from "inversify";
import { IncomingMessage, Platform } from "./IncomingMessage";
import { Replier } from "./Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { QrService } from "../services/QrService";
import { ProductService } from "../services/ProductService";
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
import { MessageProcessingService, ModelResponse } from "../services/MessageProcessingService";
import { IUser, Language } from "../models/User";
import { extractAccessKey, isValidAccessKey } from "../utils/fiscalKey";
import { moduleForCommand } from "../modules/registry";
import { PurchaseFlow } from "../modules/fin/PurchaseFlow";
import { langOf } from "./format";
import { conversationKey } from "./conversationKey";
import { CommandDeps } from "./CommandContext";
import { findCommand } from "./commandRegistry";
import { t } from "../i18n";
import { config } from "../infra/config";
import { logger } from "../infra/logger";
import { messagesReceivedTotal } from "../infra/metrics";

// Lógica de conversa do bot, independente de plataforma. Recebe uma IncomingMessage
// normalizada e um Replier; os adapters cuidam do transporte (Telegram, WhatsApp, ...).
@injectable()
export class BotCore {
  // E-mails aguardando verificação por código (Magic Auth), por usuário.
  // Em memória, como as compras pendentes do PurchaseFlow — reiniciar perde (C2).
  private readonly pendingEmailVerification = new Map<string, string>();

  constructor(
    @inject(UserService) private userService: UserService,
    @inject(OcrService) private ocrService: OcrService,
    @inject(PurchaseService) private purchaseService: PurchaseService,
    @inject(QrService) private qrService: QrService,
    @inject(ProductService) private productService: ProductService,
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
    @inject(PurchaseFlow) private purchaseFlow: PurchaseFlow,
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
    if (
      await this.purchaseFlow.resolvePendingConfirmation(
        reply,
        platform,
        externalId,
        lang,
        msg.text ?? "",
      )
    ) {
      return;
    }

    const userId = String(user._id); // identidade canônica (Fase 6)
    const plan = user.plan ?? "free";
    const processed = await this.messageProcessingService.processMessage(
      platform,
      externalId,
      msg.text ?? "",
    );
    await this.purchaseFlow.handleProcessed(
      reply,
      platform,
      externalId,
      userId,
      lang,
      plan,
      processed,
    );
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
      await this.purchaseFlow.handleProcessed(
        reply,
        platform,
        externalId,
        userId,
        lang,
        plan,
        processed,
      );
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

    // Comando de um módulo declarado mas não construído (tarefas, projetos): responde.
    // Sem isto o `switch` abaixo o ignoraria em silêncio — a pior resposta possível.
    const owner = name ? moduleForCommand(name) : undefined;
    if (owner && !owner.implemented) {
      await reply.text(t(lang, "module_coming_soon", { title: owner.title }));
      return;
    }

    // Comando de módulo: resolvido pelo registro, sem o BotCore saber o que ele faz.
    const command = name ? findCommand(name) : undefined;
    if (command?.requiresRegistration) {
      return command.handle({
        msg,
        reply,
        platform,
        externalId,
        args,
        lang,
        user,
        userId,
        deps: this.commandDeps(),
      });
    }

    // Comandos do chassi — conta, identidade e preferências. Saem daqui no passo 3 do C4.
    switch (name) {
      case "idioma":
        return this.handleSetLanguage(reply, platform, externalId, lang, args[0]);
      case "nome":
        return this.handleSetName(reply, platform, externalId, lang, args.join(" "));
      case "email":
        return this.handleEmail(reply, platform, externalId, lang, args[0]);
      case "codigo":
        return this.handleEmailCode(reply, platform, externalId, lang, args[0]);
      case "ia":
        return this.handleSetIAModel(reply, platform, externalId, lang, args[0]);
      case "excluir_conta":
        return this.handleDeleteAccount(reply, lang, user, args[0]);
    }
  }

  // Serviços que os comandos de módulo alcançam. O BotCore os injeta e repassa; os
  // handlers não conhecem o container.
  private commandDeps(): CommandDeps {
    return {
      userService: this.userService,
      purchaseService: this.purchaseService,
      productService: this.productService,
      reminderService: this.reminderService,
      exportService: this.exportService,
      accountService: this.accountService,
      purchaseFlow: this.purchaseFlow,
    };
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
      this.pendingEmailVerification.set(conversationKey(platform, externalId), email);
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
    const key = conversationKey(platform, externalId);
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

  // ---------- Perfil (edição de nome — LGPD) ----------

  private async handleSetName(
    reply: Replier,
    platform: Platform,
    externalId: string,
    lang: Language,
    name: string,
  ): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      await reply.text(t(lang, "name_usage"));
      return;
    }
    await this.userService.setName(platform, externalId, trimmed);
    await reply.text(t(lang, "name_updated", { name: trimmed }));
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
}
