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
import { MessageProcessingService, ModelResponse } from "../services/MessageProcessingService";
import { IUser, Language } from "../models/User";
import { extractAccessKey, isValidAccessKey } from "../utils/fiscalKey";
import { moduleForCommand } from "../modules/registry";
import { PurchaseFlow } from "../modules/fin/PurchaseFlow";
import { TaskService } from "../modules/tasks/TaskService";
import { ProactiveService } from "./proactive/ProactiveService";
import { langOf } from "./format";
import { CommandDeps } from "./CommandContext";
import { findCommand } from "./commandRegistry";
import { AccountLinking } from "./AccountLinking";
import { PendingEmailStore } from "./PendingEmailStore";
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
    @inject(AccountLinking) private accountLinking: AccountLinking,
    @inject(PendingEmailStore) private pendingEmails: PendingEmailStore,
    @inject(TaskService) private taskService: TaskService,
    @inject(ProactiveService) private proactive: ProactiveService,
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
      await this.accountLinking.autoLinkWhatsappPhone(platform, externalId);
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

    // Escrever logo depois de um aviso proativo conta como resposta a ele. É a única
    // medida honesta de "isto ajudou ou incomodou" — sem ela, ajustaríamos as regras
    // no escuro. Não bloqueia a mensagem: falhar aqui não pode custar a resposta.
    void this.proactive.noteUserReplied(userId).catch(() => undefined);

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

    // O telefone compartilhado vira `verifiedPhone` e serve de chave de fusão de
    // contas — então aceitar o contato de OUTRA pessoa deixaria alguém reivindicar o
    // telefone alheio. Quem sabe se o contato é do próprio remetente é o adapter;
    // quem sabe o idioma para recusar é aqui.
    if (msg.contact.belongsToSender === false) {
      await reply.text(t(lang, "contact_not_yours"));
      return;
    }

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
    if (!name) return;

    const args = msg.command?.args ?? [];
    const command = findCommand(name);

    // Comando de um módulo declarado mas não construído (tarefas, projetos): responde.
    // Sem isto ele cairia no vazio — a pior resposta possível.
    const owner = moduleForCommand(name);
    if (owner && !owner.implemented) {
      const lang = await this.resolveLang(platform, externalId);
      await reply.text(t(lang, "module_coming_soon", { title: t(lang, owner.titleKey) }));
      return;
    }

    if (!command) return;

    const base = { msg, reply, platform, externalId, args, deps: this.commandDeps() };

    // `/start` e `/vincular` rodam antes do cadastro: quem chega por deep-link ainda
    // não tem conta, e exigir cadastro antes tornaria o vínculo impossível.
    if (!command.requiresRegistration) {
      const lang = await this.resolveLang(platform, externalId);
      return command.handle({ ...base, lang });
    }

    const user = await this.requireRegistered(reply, platform, externalId);
    if (!user) return;

    return command.handle({
      ...base,
      lang: langOf(user),
      user,
      userId: String(user._id), // identidade canônica (Fase 6)
    });
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
      authService: this.authService,
      mergeService: this.mergeService,
      messageProcessingService: this.messageProcessingService,
      accountLinking: this.accountLinking,
      pendingEmails: this.pendingEmails,
      purchaseFlow: this.purchaseFlow,
      taskService: this.taskService,
    };
  }
}
