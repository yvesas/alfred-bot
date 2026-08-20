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
  private model?: any;

  // O cliente é criado na primeira leitura, não no construtor.
  //
  // O `VertexAI` estoura se não conseguir inferir o projeto, e o container instancia
  // este provider mesmo quando `OCR_PROVIDER` aponta para outro — então construção
  // ávida derrubava o startup de quem nem usa Gemini, e derrubava o CI, que não tem
  // credencial de GCP. Preguiçoso, quem não usa não paga.
  private getModel(): any {
    this.model ??= new VertexAI({
      project: config.gcpProjectId,
      location: config.geminiLocation,
    }).getGenerativeModel({ model: config.geminiVisionModel });
    return this.model;
  }

  async extractTextFromImage(base64Image: string): Promise<string> {
    try {
      const result = await this.getModel().generateContent({
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
