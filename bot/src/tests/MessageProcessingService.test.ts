/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { MessageProcessingService } from "../services/MessageProcessingService";
import { GeminiProcessor } from "../services/GeminiProcessor";
import { GptProcessor } from "../services/GptProcessor";
import { UserRepository } from "../repositories/UserRepository";

const TG = "telegram" as const;

describe("MessageProcessingService", () => {
  let gemini: sinon.SinonStubbedInstance<GeminiProcessor>;
  let gpt: sinon.SinonStubbedInstance<GptProcessor>;
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;
  let mps: MessageProcessingService;

  beforeEach(() => {
    gemini = sinon.createStubInstance(GeminiProcessor);
    gpt = sinon.createStubInstance(GptProcessor);
    userRepo = sinon.createStubInstance(UserRepository);
    mps = new MessageProcessingService(gemini, gpt, userRepo);
  });

  it("usa o Gemini por padrão e chaveia pelo User._id", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1", categories: [], language: "pt" } as any);
    gemini.processMessage.resolves({ intent: "purchase", total: 5 } as any);

    const res = await mps.processMessage(TG, "1", "agua 5");

    expect(gemini.processMessage.calledOnce).toBe(true);
    expect(gpt.processMessage.called).toBe(false);
    expect(res.userId).toBe("u1");
  });

  it("usa o GPT quando o usuário escolheu", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1", aiModel: "gpt" } as any);
    gpt.processMessage.resolves({ intent: "query", period: "current_month" } as any);

    await mps.processMessage(TG, "1", "quanto gastei?");

    expect(gpt.processMessage.calledOnce).toBe(true);
  });

  it("cai no externalId quando o usuário não existe", async () => {
    userRepo.findByIdentity.resolves(null);
    gemini.processMessage.resolves({ intent: "purchase" } as any);

    const res = await mps.processMessage(TG, "999", "x");
    expect(res.userId).toBe("999");
  });

  it("resposta nula vira 'não entendi'", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1" } as any);
    gemini.processMessage.resolves(null);

    const res = await mps.processMessage(TG, "1", "???");
    expect(res.intent).toBe("unknown");
    expect(res.message).toContain("entendi");
  });

  it("erro do processador vira mensagem de erro (intent unknown)", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1" } as any);
    gemini.processMessage.rejects(new Error("ia caiu"));

    const res = await mps.processMessage(TG, "1", "x");
    expect(res.intent).toBe("unknown");
    expect(res.message).toContain("Erro");
  });

  it("processImage usa o modelo multimodal e seta o userId", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1" } as any);
    gemini.processImage.resolves({ intent: "purchase" } as any);

    const res = await mps.processImage(TG, "1", "base64");
    expect(res?.userId).toBe("u1");
  });

  it("processImage retorna null quando o modelo não suporta imagem", async () => {
    userRepo.findByIdentity.resolves({ _id: "u1", aiModel: "gpt" } as any);
    (gpt as any).processImage = undefined; // GPT sem suporte multimodal

    const res = await mps.processImage(TG, "1", "base64");
    expect(res).toBeNull();
  });

  it("setUserModel valida o modelo", async () => {
    expect(await mps.setUserModel(TG, "1", "xyz")).toContain("inválido");
    expect(userRepo.updateByIdentity.called).toBe(false);

    const ok = await mps.setUserModel(TG, "1", "gpt");
    expect(ok).toContain("GPT");
    expect(userRepo.updateByIdentity.calledWith(TG, "1", { aiModel: "gpt" })).toBe(true);
  });
});
