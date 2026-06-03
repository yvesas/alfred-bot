import "reflect-metadata";
import { OcrService } from "../services/OcrService";
import { IOcrProvider } from "../services/ocr/IOcrProvider";
import sinon from "sinon";

describe("OcrService", () => {
  it("delegates extractTextFromImage to the injected provider", async () => {
    const extractTextFromImage = sinon.stub<[string], Promise<string>>().resolves("texto extraído");
    const provider: IOcrProvider = { extractTextFromImage };
    const service = new OcrService(provider);

    const result = await service.extractTextFromImage("base64-da-imagem");

    expect(result).toBe("texto extraído");
    expect(extractTextFromImage.calledOnceWith("base64-da-imagem")).toBe(true);
  });
});
