/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { PaddleOcrProvider } from "../services/ocr/PaddleOcrProvider";
import sinon from "sinon";

describe("PaddleOcrProvider", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("posts the image to the service and returns the extracted text", async () => {
    const fetchStub = sinon.stub(global, "fetch").resolves({
      ok: true,
      json: async () => ({ text: "AGUA 7,00\nTOTAL 7,00" }),
    } as any);

    const provider = new PaddleOcrProvider();
    const text = await provider.extractTextFromImage("base64-img");

    expect(text).toBe("AGUA 7,00\nTOTAL 7,00");
    expect(fetchStub.calledOnce).toBe(true);
  });

  it("returns a graceful error message when the service is unreachable", async () => {
    sinon.stub(global, "fetch").rejects(new Error("connection refused"));

    const provider = new PaddleOcrProvider();
    const text = await provider.extractTextFromImage("base64-img");

    expect(text).toBe("Erro ao processar a imagem.");
  });

  it("returns a graceful error message on non-2xx responses", async () => {
    sinon.stub(global, "fetch").resolves({ ok: false, status: 500 } as any);

    const provider = new PaddleOcrProvider();
    const text = await provider.extractTextFromImage("base64-img");

    expect(text).toBe("Erro ao processar a imagem.");
  });
});
