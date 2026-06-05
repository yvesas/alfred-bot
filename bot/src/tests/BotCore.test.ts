/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { BotCore } from "../core/BotCore";
import { IncomingMessage } from "../core/IncomingMessage";
import { Replier } from "../core/Replier";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { PurchaseService } from "../services/PurchaseService";
import { RateLimiter } from "../services/RateLimiter";
import { MessageProcessingService } from "../services/MessageProcessingService";

function baseMsg(over: Partial<IncomingMessage>): IncomingMessage {
  return { platform: "telegram", externalId: "1", kind: "text", ...over } as IncomingMessage;
}

describe("BotCore", () => {
  let userService: sinon.SinonStubbedInstance<UserService>;
  let ocrService: sinon.SinonStubbedInstance<OcrService>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let rateLimiter: sinon.SinonStubbedInstance<RateLimiter>;
  let mps: sinon.SinonStubbedInstance<MessageProcessingService>;
  let core: BotCore;
  let replies: string[];
  let reply: Replier;

  beforeEach(() => {
    userService = sinon.createStubInstance(UserService);
    ocrService = sinon.createStubInstance(OcrService);
    purchaseService = sinon.createStubInstance(PurchaseService);
    rateLimiter = sinon.createStubInstance(RateLimiter);
    mps = sinon.createStubInstance(MessageProcessingService);
    core = new BotCore(userService, ocrService, purchaseService, rateLimiter, mps);

    replies = [];
    reply = { text: async (m: string) => void replies.push(m) };
    rateLimiter.allow.returns(true);
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
    expect(userService.findByIdentity.called).toBe(false);
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
});
