/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { GeminiOcrProvider } from "../services/ocr/GeminiOcrProvider";
import sinon from "sinon";

describe("GeminiOcrProvider", () => {
  let provider: GeminiOcrProvider;
  let modelStub: any;

  beforeEach(() => {
    process.env.GCP_PROJECT_ID = "test-project";
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

  it("returns a graceful error message when Gemini fails", async () => {
    modelStub.generateContent.rejects(new Error("vertex error"));

    const text = await provider.extractTextFromImage("base64-img");

    expect(text).toBe("Erro ao processar a imagem.");
  });
});
