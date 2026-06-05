/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { BotCore } from "../core/BotCore";
import { IncomingMessage } from "../core/IncomingMessage";
import { Replier } from "../core/Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { BudgetService } from "../services/BudgetService";
import { ReminderService } from "../services/ReminderService";
import { RateLimiter } from "../services/RateLimiter";
import { MessageProcessingService } from "../services/MessageProcessingService";

function baseMsg(over: Partial<IncomingMessage>): IncomingMessage {
  return { platform: "telegram", externalId: "1", kind: "text", ...over } as IncomingMessage;
}

describe("BotCore", () => {
  let userService: sinon.SinonStubbedInstance<UserService>;
  let ocrService: sinon.SinonStubbedInstance<OcrService>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let budgetService: sinon.SinonStubbedInstance<BudgetService>;
  let reminderService: sinon.SinonStubbedInstance<ReminderService>;
  let rateLimiter: sinon.SinonStubbedInstance<RateLimiter>;
  let mps: sinon.SinonStubbedInstance<MessageProcessingService>;
  let core: BotCore;
  let replies: string[];
  let reply: Replier;

  beforeEach(() => {
    userService = sinon.createStubInstance(UserService);
    ocrService = sinon.createStubInstance(OcrService);
    purchaseService = sinon.createStubInstance(PurchaseService);
    budgetService = sinon.createStubInstance(BudgetService);
    reminderService = sinon.createStubInstance(ReminderService);
    rateLimiter = sinon.createStubInstance(RateLimiter);
    mps = sinon.createStubInstance(MessageProcessingService);
    core = new BotCore(
      userService,
      ocrService,
      purchaseService,
      budgetService,
      reminderService,
      rateLimiter,
      mps,
    );

    replies = [];
    reply = { text: async (m: string) => void replies.push(m) };
    rateLimiter.allow.returns(true);
    budgetService.alertsForPurchase.resolves([]);
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
    userService.findByIdentity.resolves({ status: "complete" } as any);
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
    userService.findByIdentity.resolves({ status: "complete" } as any);
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
    userService.findByIdentity.resolves({ status: "complete" } as any);
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
    userService.findByIdentity.resolves({ status: "complete" } as any);
    purchaseService.getUserPurchases.resolves([
      { _id: "p1", description: "agua", total: 7 } as any,
    ]);
    purchaseService.deletePurchase.resolves({} as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "excluir", args: ["1"] } }),
      reply,
    );

    expect(purchaseService.deletePurchase.calledWith("1", "p1")).toBe(true);
    expect(replies.some((r) => r.includes("Excluído"))).toBe(true);
  });

  it("edits the nth purchase total via /editar", async () => {
    userService.findByIdentity.resolves({ status: "complete" } as any);
    purchaseService.getUserPurchases.resolves([
      { _id: "p1", description: "agua", total: 7 } as any,
    ]);
    purchaseService.updatePurchase.resolves({ description: "agua", total: 10 } as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "editar", args: ["1", "total", "10"] } }),
      reply,
    );

    expect(purchaseService.updatePurchase.calledWith("1", "p1", { total: 10 })).toBe(true);
    expect(replies.some((r) => r.includes("Atualizado"))).toBe(true);
  });

  it("sets the language via /idioma", async () => {
    userService.findByIdentity.resolves({ status: "complete" } as any);
    userService.setLanguage.resolves();

    await core.handle(
      baseMsg({ kind: "command", command: { name: "idioma", args: ["en"] } }),
      reply,
    );

    expect(userService.setLanguage.calledWith("telegram", "1", "en")).toBe(true);
    expect(replies.some((r) => r.includes("English"))).toBe(true);
  });

  it("appends a budget alert when saving a purchase over the limit", async () => {
    userService.findByIdentity.resolves({ status: "complete" } as any);
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

  it("sets a category budget via /orcamento", async () => {
    userService.findByIdentity.resolves({ status: "complete" } as any);
    userService.setBudget.resolves([{ category: "Alimentação", limit: 500 }] as any);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "orcamento", args: ["Alimentação", "500"] } }),
      reply,
    );

    expect(userService.setBudget.calledWith("telegram", "1", "Alimentação", 500)).toBe(true);
    expect(replies.some((r) => r.includes("Orçamento de Alimentação definido"))).toBe(true);
  });

  it("creates a reminder via /lembretes add", async () => {
    userService.findByIdentity.resolves({ status: "complete" } as any);
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
    userService.findByIdentity.resolves({ status: "complete" } as any);
    reminderService.list.resolves([{ description: "Conta de luz", dayOfMonth: 10 } as any]);

    await core.handle(
      baseMsg({ kind: "command", command: { name: "lembretes", args: [] } }),
      reply,
    );

    expect(replies.some((r) => r.includes("dia 10") && r.includes("Conta de luz"))).toBe(true);
  });
});
