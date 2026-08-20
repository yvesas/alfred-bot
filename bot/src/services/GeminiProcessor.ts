/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { injectable } from "inversify";
import { VertexAI } from "@google-cloud/vertexai";
import { IMessageProcessor, ModelResponse } from "./MessageProcessingService";
import { getPrompt001 } from "../IA/prompts";
import { validateAndConvertModelResponse } from "../infra/converters/modelResponseConverter";
import { config } from "../infra/config";

@injectable()
export class GeminiProcessor implements IMessageProcessor {
  private model?: any;

  // Cliente preguiçoso — ver a nota em GeminiOcrProvider. O `VertexAI` estoura sem
  // projeto inferível, e este processador é instanciado mesmo para quem escolheu GPT.
  private getModel(): any {
    this.model ??= new VertexAI({
      project: config.gcpProjectId,
      location: config.geminiLocation,
    }).getGenerativeModel({ model: config.geminiModel });
    return this.model;
  }

  async processMessage(
    message: string,
    categories?: string[],
    lang?: string,
  ): Promise<ModelResponse | null> {
    try {
      const prompt = getPrompt001(lang ?? null, message, categories);

      const result = await this.getModel().generateContent(prompt);
      const response = await result.response;
      let text = response.candidates[0].content.parts[0].text;
      return validateAndConvertModelResponse(text);
    } catch (error: Error | any) {
      throw error;
    }
  }

  // Fase 3: lê a imagem do cupom e extrai o JSON numa única chamada multimodal
  // (sem o passo intermediário de OCR → texto).
  async processImage(
    base64Image: string,
    categories?: string[],
    lang?: string,
  ): Promise<ModelResponse | null> {
    const prompt = getPrompt001(
      lang ?? null,
      "(o conteúdo da compra está na imagem do cupom acima)",
      categories,
    );

    const result = await this.getModel().generateContent({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType: "image/jpeg", data: base64Image } }, { text: prompt }],
        },
      ],
    });

    const response = await result.response;
    const text = response.candidates[0].content.parts[0].text;
    return validateAndConvertModelResponse(text);
  }
}
