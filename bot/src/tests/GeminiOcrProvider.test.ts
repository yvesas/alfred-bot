/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { GeminiOcrProvider } from "../services/ocr/GeminiOcrProvider";
import { OcrError } from "../utils/errors";
import sinon from "sinon";

describe("GeminiOcrProvider", () => {
  let provider: GeminiOcrProvider;
  let modelStub: any;

  beforeEach(() => {
    provider = new GeminiOcrProvider();
    modelStub = { generateContent: sinon.stub() };
    (provider as any).model = modelStub;
  });

  afterEach(() => {
    sinon.restore();
  });

  it("returns the transcribed text extracted from the image", async () => {
    modelStub.generateContent.resolves({
      response: { candidates: [{ content: { parts: [{ text: "AGUA 7,00\nTOTAL 7,00" }] } }] },
    });

    const text = await provider.extractTextFromImage("base64-img");

    expect(text).toBe("AGUA 7,00\nTOTAL 7,00");
    expect(modelStub.generateContent.calledOnce).toBe(true);
  });

  // C12: a falha não pode virar "texto do cupom" — precisa subir como erro tipado,
  // senão a IA recebe a mensagem de erro como se fosse o conteúdo lido.
  it("throws OcrError instead of returning the failure as text", async () => {
    modelStub.generateContent.rejects(new Error("vertex error"));

    await expect(provider.extractTextFromImage("base64-img")).rejects.toThrow(OcrError);
  });

  // O desligamento de um modelo (2026-06-01, gemini-2.0-flash-lite) chega como erro do
  // provedor. Tem que estourar, não virar "não entendi". Ver C0.
  it("throws when the provider rejects the configured model", async () => {
    modelStub.generateContent.rejects(new Error("404 Publisher Model not found"));

    await expect(provider.extractTextFromImage("base64-img")).rejects.toThrow(OcrError);
  });
});
