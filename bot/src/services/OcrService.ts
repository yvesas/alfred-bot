import "reflect-metadata";
import { inject, injectable } from "inversify";
import { IOcrProvider, OCR_PROVIDER_TOKEN } from "./ocr/IOcrProvider";

// Fachada de OCR usada pelo bot. Delega para o provedor selecionado por ambiente
// (ver factory em infra/Container.ts). O bot não conhece o provedor concreto.
@injectable()
export class OcrService {
  constructor(@inject(OCR_PROVIDER_TOKEN) private provider: IOcrProvider) {}

  public extractTextFromImage(base64Image: string): Promise<string> {
    return this.provider.extractTextFromImage(base64Image);
  }
}
