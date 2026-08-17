/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { injectable } from "inversify";
import { VertexAI } from "@google-cloud/vertexai";
import { IOcrProvider } from "./IOcrProvider";
import { OcrError } from "../../utils/errors";
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
    const vertexAI = new VertexAI({ project: projectId, location: config.geminiLocation });
    this.model = vertexAI.getGenerativeModel({ model: config.geminiVisionModel });
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
      logger.error({ err: error, model: config.geminiVisionModel }, "Falha no OCR (Gemini)");
      throw new OcrError("Falha ao ler a imagem com o Gemini.", "gemini");
    }
  }
}
