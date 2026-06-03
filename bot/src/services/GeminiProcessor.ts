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
  private vertexAI: VertexAI;
  private projectId: string;
  private location: string;
  private modelName: string;
  private model: any;

  constructor() {
    this.projectId = config.gcpProjectId;
    this.location = "us-central1";
    this.modelName = "gemini-2.0-flash-lite-001";

    this.vertexAI = new VertexAI({ project: this.projectId, location: this.location });
    this.model = this.vertexAI.getGenerativeModel({
      model: this.modelName,
    });
  }

  async processMessage(message: string): Promise<ModelResponse | null> {
    try {
      const prompt = getPrompt001(null, message);

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.candidates[0].content.parts[0].text;
      return validateAndConvertModelResponse(text);
    } catch (error: Error | any) {
      throw error;
    }
  }

  // Fase 3: lê a imagem do cupom e extrai o JSON numa única chamada multimodal
  // (sem o passo intermediário de OCR → texto).
  async processImage(base64Image: string): Promise<ModelResponse | null> {
    const prompt = getPrompt001(null, "(o conteúdo da compra está na imagem do cupom acima)");

    const result = await this.model.generateContent({
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
