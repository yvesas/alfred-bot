import "reflect-metadata";
import { injectable } from "inversify";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import dotenv from "dotenv";
import { IOcrProvider } from "./IOcrProvider";

dotenv.config();

// Provedor de OCR usando o Google Cloud Vision (textDetection).
@injectable()
export class VisionOcrProvider implements IOcrProvider {
  private client: ImageAnnotatorClient;

  constructor() {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS not set. Please configure your environment variable.",
      );
    }

    this.client = new ImageAnnotatorClient({ fallback: true });
  }

  public async extractTextFromImage(base64Image: string): Promise<string> {
    try {
      const [result] = await this.client.textDetection({
        image: { content: base64Image },
      });

      const detections = result.textAnnotations;

      if (detections && detections.length > 0) {
        return detections[0].description || "Nenhum texto detectado.";
      } else {
        return "Nenhum texto encontrado na imagem.";
      }
    } catch (error) {
      console.error("Erro ao processar a imagem:", error);
      return "Erro ao processar a imagem.";
    }
  }
}
