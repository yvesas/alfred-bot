import "reflect-metadata";
import { injectable } from "inversify";
import { IOcrProvider } from "./IOcrProvider";

// Provedor de OCR self-hosted: chama o microserviço FastAPI/PaddleOCR via HTTP.
// O serviço roda como aplicação à parte (ver projeto ../ocr-service e o docker-compose
// na raiz /alfred). Ativado com OCR_PROVIDER=paddle.
@injectable()
export class PaddleOcrProvider implements IOcrProvider {
  private url: string;

  constructor() {
    this.url = process.env.PADDLE_OCR_URL ?? "http://ocr:8000";
  }

  async extractTextFromImage(base64Image: string): Promise<string> {
    try {
      const res = await fetch(`${this.url}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!res.ok) {
        throw new Error(`OCR service respondeu ${res.status}`);
      }

      const data = (await res.json()) as { text: string };
      return data.text || "Nenhum texto detectado.";
    } catch (error) {
      console.error("Erro ao processar a imagem (PaddleOCR):", error);
      return "Erro ao processar a imagem.";
    }
  }
}
