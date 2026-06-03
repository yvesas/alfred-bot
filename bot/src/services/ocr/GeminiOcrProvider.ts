/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { injectable } from "inversify";
import { VertexAI } from "@google-cloud/vertexai";
import { IOcrProvider } from "./IOcrProvider";
import { logger } from "../../infra/logger";
import { config } from "../../infra/config";

// Provedor de OCR usando o Gemini (multimodal) via Vertex AI.
// Lê a imagem diretamente e transcreve o texto — dispensa o Google Vision.
// Usa o GCP_PROJECT_ID já configurado, sem credencial adicional.
@injectable()
export class GeminiOcrProvider implements IOcrProvider {
  private model: any;

  constructor() {
    const projectId = config.gcpProjectId;
    const vertexAI = new VertexAI({ project: projectId, location: "us-central1" });
    this.model = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });
  }

  async extractTextFromImage(base64Image: string): Promise<string> {
    try {
      const result = await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: base64Image } },
              {
                text: "Transcreva TODO o texto deste cupom fiscal, linha a linha, exatamente como aparece, sem interpretar, resumir ou adicionar nada.",
              },
            ],
          },
        ],
      });

      return result.response.candidates[0].content.parts[0].text || "Nenhum texto detectado.";
    } catch (error) {
      logger.error({ err: error }, "Erro ao processar a imagem (Gemini OCR)");
      return "Erro ao processar a imagem.";
    }
  }
}
