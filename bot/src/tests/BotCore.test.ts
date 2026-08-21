/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { BotCore } from "../core/BotCore";
import { IncomingMessage } from "../core/IncomingMessage";
import { Replier } from "../core/Replier";
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
import { MessageProcessingService } from "../services/MessageProcessingService";
import { PurchaseFlow } from "../modules/fin/PurchaseFlow";
import { AccountLinking } from "../core/AccountLinking";
import { PendingEmailStore } from "../core/PendingEmailStore";
import { TaskService } from "../modules/tasks/TaskService";
import { FakeConversationStore } from "./helpers/fakeConversationStore";
import { accessKeyCheckDigit } from "../utils/fiscalKey";

function baseMsg(over: Partial<IncomingMessage>): IncomingMessage {
  return { platform: "telegram", externalId: "1", kind: "text", ...over } as IncomingMessage;
}

describe("BotCore", () => {
  let userService: sinon.SinonStubbedInstance<UserService>;
  let ocrService: sinon.SinonStubbedInstance<OcrService>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let qrService: sinon.SinonStubbedInstance<QrService>;
  let productService: sinon.SinonStubbedInstance<ProductService>;
  let budgetService: sinon.SinonStubbedInstance<BudgetService>;
  let reminderService: sinon.SinonStubbedInstance<ReminderService>;
  let mergeService: sinon.SinonStubbedInstance<MergeService>;
  let linkTokens: sinon.SinonStubbedInstance<LinkTokenService>;
  let authService: sinon.SinonStubbedInstance<AuthService>;
  let planService: sinon.SinonStubbedInstance<PlanService>;
  let exportService: sinon.SinonStubbedInstance<ExportService>;
  let accountService: sinon.SinonStubbedInstance<AccountService>;
  let rateLimiter: sinon.SinonStubbedInstance<RateLimiter>;
  let mps: sinon.SinonStubbedInstance<MessageProcessingService>;
  let purchaseFlow: PurchaseFlow;
  let accountLinking: AccountLinking;
  let pendingEmails: PendingEmailStore;
  let taskService: sinon.SinonStubbedInstance<TaskService>;
  let core: BotCore;
  let replies: string[];
  let reply: Replier;

  beforeEach(() => {
    userService = sinon.createStubInstance(UserService);
    ocrService = sinon.createStubInstance(OcrService);
    purchaseService = sinon.createStubInstance(PurchaseService);
    qrService = sinon.createStubInstance(QrService);
    productService = sinon.createStubInstance(ProductService);
    budgetService = sinon.createStubInstance(BudgetService);
    reminderService = sinon.createStubInstance(ReminderService);
    mergeService = sinon.createStubInstance(MergeService);
    linkTokens = sinon.createStubInstance(LinkTokenService);
    authService = sinon.createStubInstance(AuthService);
    planService = sinon.createStubInstance(PlanService);
    exportService = sinon.createStubInstance(ExportService);
    accountService = sinon.createStubInstance(AccountService);
    rateLimiter = sinon.createStubInstance(RateLimiter);
    mps = sinon.createStubInstance(MessageProcessingService);
    // Fluxo de compra real: o BotCore delega a ele, e os testes de compra exercitam
    // o caminho inteiro — trocá-lo por stub esconderia justamente o que se quer provar.
    // Store em memória: o C2 tirou as pendências do processo, mas o teste unitário
    // não quer banco. O comportamento real do store é provado à parte.
    const conversationStore = new FakeConversationStore();
    purchaseFlow = new PurchaseFlow(purchaseService, budgetService, planService, conversationStore);
    // Reais, como o PurchaseFlow: são estado e colaboração do próprio fluxo, não
    // fronteira externa. Stubá-los esconderia o que os testes de vínculo provam.
    accountLinking = new AccountLinking(mergeService, linkTokens);
    pendingEmails = new PendingEmailStore(conversationStore);
    taskService = sinon.createStubInstance(TaskService);
    core = new BotCore(
      userService,
      ocrService,
      purchaseService,
      qrService,
      productService,
      budgetService,
      reminderService,
      mergeService,
      linkTokens,
      authService,
      planService,
      exportService,
      accountService,
      rateLimiter,
      mps,
      purchaseFlow,
      accountLinking,
      pendingEmails,
      taskService,
    );

    replies = [];
    reply = { text: async (m: string) => void replies.push(m) };
    rateLimiter.allow.returns(true);
    budgetService.alertsForPurchase.resolves([]);
    planService.canRegister.resolves(true);
  });

  // C4 — o despacho de comando virou registro. Estes casos cobrem os desvios que o
  // `switch` antigo escondia: comando sem nome, comando que ninguém atende, e comando
  // de um módulo declarado mas não construído.
  describe("despacho de comando", () => {
    const completeUser = { _id: "u1", status: "complete", language: "pt" } as any;

    it("ignora comando sem nome", async () => {
      await core.handle(baseMsg({ kind: "command", command: { name: "", args: [] } }), reply);

      expect(replies).toEqual([]);
      expect(userService.findByIdentity.called).toBe(false);
    });

    it("ignora comando que ninguém atende", async () => {
      userService.findByIdentity.resolves(completeUser);

      await core.handle(
        baseMsg({ kind: "command", command: { name: "inventado", args: [] } }),
        reply,
      );

      expect(replies).toEqual([]);
    });

    // Sem isto o comando cairia no vazio — a pior resposta possível.
    it("avisa que o módulo declarado ainda não foi construído", async () => {
      userService.findByIdentity.resolves(completeUser);

      await core.handle(
        baseMsg({ kind: "command", command: { name: "projetos", args: [] } }),
        reply,
      );

      expect(replies[0]).toContain("Projetos");
      expect(replies[0]).toContain("ainda não está disponível");
    });

    // `tarefas` deixou de responder isso na Fase 1 — o módulo foi construído.
    it("despacha o comando de um módulo construído", async () => {
      userService.findByIdentity.resolves(completeUser);
      taskService.listPending.resolves([]);

      await core.handle(
        baseMsg({ kind: "command", command: { name: "tarefas", args: [] } }),
        reply,
      );

      expect(taskService.listPending.calledOnce).toBe(true);
      expect(replies[0]).not.toContain("ainda não está disponível");
    });

    // O aviso vem ANTES de exigir cadastro: quem nem se cadastrou ainda merece saber
    // que o módulo não existe, em vez de ser mandado completar o cadastro à toa.
    it("avisa do módulo não construído mesmo sem cadastro completo", async () => {
      userService.findByIdentity.resolves(null);

      await core.handle(
        baseMsg({ kind: "command", command: { name: "projetos", args: [] } }),
        reply,
      );

      expect(replies[0]).toContain("Projetos");
      expect(userService.ensureUser.called).toBe(false);
    });
  });

  // C15 — quem recusa o contato de terceiro é o núcleo, que sabe o idioma; antes era
  // o adapter do Telegram, com português fixo.
  describe("contato compartilhado", () => {
    const contactMsg = (belongsToSender?: boolean) =>
      baseMsg({
        kind: "contact",
        contact: { phone: "+5548999990000", name: "Ana", belongsToSender },
      });

    it("recusa o contato de outra pessoa, sem salvar", async () => {
      userService.findByIdentity.resolves({ language: "pt" } as any);

      await core.handle(contactMsg(false), reply);

      expect(replies[0]).toContain("seu próprio contato");
      expect(userService.saveContact.called).toBe(false);
      expect(mergeService.linkVerifiedPhone.called).toBe(false);
    });

    it("recusa no idioma do usuário", async () => {
      userService.findByIdentity.resolves({ language: "en" } as any);

      await core.handle(contactMsg(false), reply);

      expect(replies[0]).toContain("your own contact");
    });

    it("aceita o contato do próprio remetente", async () => {
      userService.findByIdentity.resolves({ language: "pt" } as any);
      userService.saveContact.resolves({ reply: "ok", completed: true });

      await core.handle(contactMsg(true), reply);

      expect(userService.saveContact.calledOnce).toBe(true);
      expect(mergeService.linkVerifiedPhone.calledOnce).toBe(true);
    });

    // Plataforma que não informa a origem do contato: aceitar é o comportamento
    // anterior, e o WhatsApp nem passa por aqui (o número já é o externalId).
    it("aceita quando a plataforma não informa a origem", async () => {
      userService.findByIdentity.resolves({ language: "pt" } as any);
      userService.saveContact.resolves({ reply: "ok", completed: true });

      await core.handle(contactMsg(undefined), reply);

      expect(userService.saveContact.calledOnce).toBe(true);
    });
  });

  it("greets a returning user on /start", async () => {
    userService.ensureUser.resolves({
      user: { status: "complete", name: "Yves" } as any,
      question: "",
    });

    await core.handle(baseMsg({ kind: "command", command: { name: "start", args: [] } }), reply);

    expect(replies[0]).toContain("Olá de novo");
    expect(replies[0]).toContain("Yves");
  });

  it("blocks a text message when rate limited", async () => {
    rateLimiter.allow.returns(false);

    await core.handle(baseMsg({ kind: "text", text: "oi" }), reply);

    expect(replies[0]).toContain("Muitas mensagens");
    // O caminho caro (processamento pela IA) não roda quando bloqueado.
    expect(mps.processMessage.called).toBe(false);
  });

  it("asks to confirm a purchase, then saves on 'sim'", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({
      intent: "purchase",
      userId: "1",
      description: "agua",
      total: 7,
      date: new Date(),
      items: [],
    });
    purchaseService.addPurchase.resolves({} as any);

    // 1ª mensagem: pede confirmação, ainda não salva.
    await core.handle(baseMsg({ kind: "text", text: "agua 7" }), reply);
    expect(purchaseService.addPurchase.called).toBe(false);
    expect(replies.some((r) => r.includes("Confirmar"))).toBe(true);

    // "sim": salva.
    replies.length = 0;
    await core.handle(baseMsg({ kind: "text", text: "sim" }), reply);
    expect(purchaseService.addPurchase.calledOnce).toBe(true);
    expect(replies.some((r) => r.includes("Compra registrada"))).toBe(true);
  });

  it("cancels a pending purchase on 'não'", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({
      intent: "purchase",
      userId: "1",
      description: "agua",
      total: 7,
      date: new Date(),
      items: [],
    });

    await core.handle(baseMsg({ kind: "text", text: "agua 7" }), reply);
    replies.length = 0;
    await core.handle(baseMsg({ kind: "text", text: "não" }), reply);

    expect(purchaseService.addPurchase.called).toBe(false);
    expect(replies.some((r) => r.toLowerCase().includes("cancel"))).toBe(true);
  });

  it("answers a spending query", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({ intent: "query", period: "current_month" });
    purchaseService.getSpendingReport.resolves({
      period: "current_month",
      total: 150,
      count: 3,
      byCategory: {},
      byStore: {},
    });

    await core.handle(baseMsg({ kind: "text", text: "quanto gastei?" }), reply);

    expect(replies[0]).toContain("Gastos deste mês");
    expect(replies[0]).toContain("150");
  });

  it("deletes the nth purchase via /excluir", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    purchaseService.getUserPurchases.resolves([
      { _id: "p1", description: "agua", total: 7 } as any,
    ]);
    purchaseService.deletePurchase.resolves({} as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "excluir", args: ["1"] } }),
      reply,
    );

    expect(purchaseService.deletePurchase.calledWith("u1", "p1")).toBe(true);
    expect(replies.some((r) => r.includes("Excluído"))).toBe(true);
  });

  it("edits the nth purchase total via /editar", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    purchaseService.getUserPurchases.resolves([
      { _id: "p1", description: "agua", total: 7 } as any,
    ]);
    purchaseService.updatePurchase.resolves({ description: "agua", total: 10 } as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "editar", args: ["1", "total", "10"] } }),
      reply,
    );

    expect(purchaseService.updatePurchase.calledWith("u1", "p1", { total: 10 })).toBe(true);
    expect(replies.some((r) => r.includes("Atualizado"))).toBe(true);
  });

  it("sets the language via /idioma", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    userService.setLanguage.resolves();

    await core.handle(
      baseMsg({ kind: "command", command: { name: "idioma", args: ["en"] } }),
      reply,
    );

    expect(userService.setLanguage.calledWith("telegram", "1", "en")).toBe(true);
    expect(replies.some((r) => r.includes("English"))).toBe(true);
  });

  it("atualiza o nome via /nome", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    userService.setName.resolves();

    await core.handle(
      baseMsg({ kind: "command", command: { name: "nome", args: ["João", "Silva"] } }),
      reply,
    );

    expect(userService.setName.calledWith("telegram", "1", "João Silva")).toBe(true);
    expect(replies.some((r) => r.includes("João Silva"))).toBe(true);
  });

  it("adiciona ao estoque via /estoque add", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    productService.addOrIncrement.resolves({ name: "Leite", quantity: 3 } as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "estoque", args: ["add", "2", "Leite"] } }),
      reply,
    );

    expect(productService.addOrIncrement.calledWith("u1", "Leite", 2)).toBe(true);
    expect(replies.some((r) => r.includes("Leite"))).toBe(true);
  });

  it("lista e remove o estoque", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    productService.getUserProducts.resolves([{ name: "Leite", quantity: 3 } as any]);
    productService.removeProduct.resolves({ name: "Leite", quantity: 0 } as any);

    await core.handle(baseMsg({ kind: "command", command: { name: "estoque", args: [] } }), reply);
    expect(replies.some((r) => r.includes("Leite") && r.includes("3"))).toBe(true);

    replies.length = 0;
    await core.handle(
      baseMsg({ kind: "command", command: { name: "estoque", args: ["remover", "Leite"] } }),
      reply,
    );
    expect(productService.removeProduct.calledWith("u1", "Leite")).toBe(true);
    expect(replies.some((r) => r.includes("Removido"))).toBe(true);
  });

  it("appends a budget alert when saving a purchase over the limit", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({
      intent: "purchase",
      userId: "1",
      description: "mercado",
      total: 90,
      date: new Date(),
      items: [],
    });
    purchaseService.addPurchase.resolves({} as any);
    budgetService.alertsForPurchase.resolves([
      "🚨 Orçamento de Alimentação estourado: R$ 90,00 de R$ 80,00 (113%).",
    ]);

    await core.handle(baseMsg({ kind: "text", text: "mercado 90" }), reply);
    await core.handle(baseMsg({ kind: "text", text: "sim" }), reply);

    expect(replies.some((r) => r.includes("Orçamento de Alimentação estourado"))).toBe(true);
  });

  it("não duplica um cupom fiscal já registrado (NFC-e)", async () => {
    const base43 = "35" + "2406" + "12345678000199" + "65" + "001" + "000000123" + "1" + "00000012";
    const key = base43 + String(accessKeyCheckDigit(base43));
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({
      intent: "purchase",
      userId: "u1",
      description: "x",
      total: 5,
      date: new Date(),
      items: [],
      accessKey: key,
    });
    purchaseService.findByFiscalKey.resolves({ _id: "existing" } as any);

    await core.handle(baseMsg({ kind: "text", text: "x" }), reply);

    expect(purchaseService.addPurchase.called).toBe(false);
    expect(replies.some((r) => r.includes("já foi registrado"))).toBe(true);
  });

  it("blocks a purchase when the free plan limit is reached", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    mps.processMessage.resolves({
      intent: "purchase",
      userId: "u1",
      description: "agua",
      total: 7,
      date: new Date(),
      items: [],
    });
    planService.canRegister.resolves(false);

    await core.handle(baseMsg({ kind: "text", text: "agua 7" }), reply);

    expect(purchaseService.addPurchase.called).toBe(false);
    expect(replies.some((r) => r.toLowerCase().includes("limite"))).toBe(true);
  });

  it("sets a category budget via /orcamento", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    userService.setBudget.resolves([{ category: "Alimentação", limit: 500 }] as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "orcamento", args: ["Alimentação", "500"] } }),
      reply,
    );

    expect(userService.setBudget.calledWith("telegram", "1", "Alimentação", 500)).toBe(true);
    expect(replies.some((r) => r.includes("Orçamento de Alimentação definido"))).toBe(true);
  });

  it("creates a reminder via /lembretes add", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    reminderService.add.resolves({ description: "Conta de luz", dayOfMonth: 10 } as any);

    await core.handle(
      baseMsg({
        kind: "command",
        command: { name: "lembretes", args: ["add", "10", "Conta", "de", "luz"] },
      }),
      reply,
    );

    expect(reminderService.add.calledWith("telegram", "1", 10, "Conta de luz")).toBe(true);
    expect(replies.some((r) => r.includes("Lembrete criado"))).toBe(true);
  });

  it("lists reminders via /lembretes", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    reminderService.list.resolves([{ description: "Conta de luz", dayOfMonth: 10 } as any]);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "lembretes", args: [] } }),
      reply,
    );

    expect(replies.some((r) => r.includes("dia 10") && r.includes("Conta de luz"))).toBe(true);
  });

  it("links an account via /vincular <token>", async () => {
    userService.ensureUser.resolves({ user: { status: "complete" } as any, question: "" });
    linkTokens.consume.resolves("canonId");
    mergeService.linkAccounts.resolves(true);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "vincular", args: ["TOK123"] } }),
      reply,
    );

    expect(linkTokens.consume.calledWith("TOK123")).toBe(true);
    expect(mergeService.linkAccounts.calledWith("telegram", "1", "canonId")).toBe(true);
    expect(replies.some((r) => r.includes("vinculada"))).toBe(true);
  });

  it("rejects /vincular with an invalid token", async () => {
    userService.ensureUser.resolves({ user: { status: "complete" } as any, question: "" });
    linkTokens.consume.resolves(null);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "vincular", args: ["BAD"] } }),
      reply,
    );

    expect(mergeService.linkAccounts.called).toBe(false);
    expect(replies.some((r) => r.toLowerCase().includes("inválido"))).toBe(true);
  });

  it("links via /start <token> (Telegram deep-link)", async () => {
    userService.ensureUser.resolves({
      user: { status: "complete", name: "Yves", _id: "u1" } as any,
      question: "",
    });
    linkTokens.consume.resolves("canonId");
    mergeService.linkAccounts.resolves(true);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "start", args: ["TOK123"] } }),
      reply,
    );

    expect(mergeService.linkAccounts.calledWith("telegram", "1", "canonId")).toBe(true);
    expect(replies.some((r) => r.includes("vinculada"))).toBe(true);
  });

  it("sends an email verification code via /email", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    authService.canVerifyEmail.returns(true);
    authService.sendEmailCode.resolves();

    await core.handle(
      baseMsg({ kind: "command", command: { name: "email", args: ["maria@example.com"] } }),
      reply,
    );

    expect(authService.sendEmailCode.calledWith("maria@example.com")).toBe(true);
    expect(replies.some((r) => r.includes("maria@example.com"))).toBe(true);
  });

  it("verifies the email code via /codigo and links the account", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    authService.canVerifyEmail.returns(true);
    authService.sendEmailCode.resolves();
    authService.verifyEmailCode.resolves(true);
    mergeService.linkVerifiedEmail.resolves();

    await core.handle(
      baseMsg({ kind: "command", command: { name: "email", args: ["maria@example.com"] } }),
      reply,
    );
    replies.length = 0;
    await core.handle(
      baseMsg({ kind: "command", command: { name: "codigo", args: ["123456"] } }),
      reply,
    );

    expect(authService.verifyEmailCode.calledWith("maria@example.com", "123456")).toBe(true);
    expect(mergeService.linkVerifiedEmail.calledWith("telegram", "1", "maria@example.com")).toBe(
      true,
    );
    expect(replies.some((r) => r.includes("verificado"))).toBe(true);
  });

  it("rejects /codigo when there is no pending verification", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "codigo", args: ["123456"] } }),
      reply,
    );

    expect(authService.verifyEmailCode.called).toBe(false);
    expect(replies.some((r) => r.toLowerCase().includes("pendente"))).toBe(true);
  });

  it("replies unavailable when email verification is not configured", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    authService.canVerifyEmail.returns(false);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "email", args: ["maria@example.com"] } }),
      reply,
    );

    expect(authService.sendEmailCode.called).toBe(false);
    expect(replies.some((r) => r.toLowerCase().includes("indisponível"))).toBe(true);
  });

  it("pede confirmação antes de excluir a conta", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "excluir_conta", args: [] } }),
      reply,
    );

    expect(accountService.deleteAccount.called).toBe(false);
    expect(replies.some((r) => r.includes("CONFIRMAR"))).toBe(true);
  });

  it("exclui a conta com /excluir_conta CONFIRMAR", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    accountService.deleteAccount.resolves({ purchases: 3, reminders: 1, tasks: 0 });

    await core.handle(
      baseMsg({ kind: "command", command: { name: "excluir_conta", args: ["CONFIRMAR"] } }),
      reply,
    );

    expect(accountService.deleteAccount.calledOnce).toBe(true);
    expect(replies.some((r) => r.toLowerCase().includes("excluíd"))).toBe(true);
  });

  it("exporta as compras em CSV via /exportar", async () => {
    userService.findByIdentity.resolves({ status: "complete", _id: "u1" } as any);
    exportService.purchasesCsv.resolves("Data,Descrição\n2026-06-01,agua");
    const docs: { filename: string; mime: string }[] = [];
    const replyDoc: Replier = {
      text: async (m: string) => void replies.push(m),
      document: async (_content: Buffer, filename: string, mime: string) =>
        void docs.push({ filename, mime }),
    };

    await core.handle(
      baseMsg({ kind: "command", command: { name: "exportar", args: [] } }),
      replyDoc,
    );

    expect(exportService.purchasesCsv.calledWith("u1")).toBe(true);
    expect(docs[0]).toEqual({ filename: "alfred-compras.csv", mime: "text/csv" });
  });
});
