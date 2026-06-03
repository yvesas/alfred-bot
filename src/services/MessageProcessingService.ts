import { injectable } from "inversify";
import { GptProcessor } from "./GptProcessor";
import { GeminiProcessor } from "./GeminiProcessor";
import { IPurchaseItem, IStoreInfo, ITaxInfo } from "../models/Purchase";

export type Intent = "purchase" | "query" | "other" | "unknown";
export type SpendingPeriod = "current_month" | "last_month" | "all";
export type SpendingGroupBy = "category" | "store";

export interface ModelResponse {
  intent: Intent;
  message?: string;
  // Campos de consulta (intent === "query")
  period?: SpendingPeriod;
  groupBy?: SpendingGroupBy;
  // Campos de compra (intent === "purchase")
  userId?: string;
  description?: string;
  total?: number;
  date?: Date;
  store?: IStoreInfo;
  tax?: ITaxInfo;
  items?: IPurchaseItem[];
}

export interface IMessageProcessor {
  processMessage(message: string): Promise<ModelResponse | null>;
  // Opcional: modelos multimodais leem a imagem direto (OCR + extração em uma chamada).
  processImage?(base64Image: string): Promise<ModelResponse | null>;
}

@injectable()
export class MessageProcessingService {
  private userModelMap: Map<string, string>;

  constructor() {
    this.userModelMap = new Map();
  }

  setUserModel(userId: string, model: string) {
    if (model !== "gpt" && model !== "gemini") {
      return `Modelo inválido! Escolha entre "gpt" ou "gemini".`;
    }

    this.userModelMap.set(userId, model);
    return `🤖 Modelo atualizado para ${model.toUpperCase()}!`;
  }

  private getProcessor(userId: string): IMessageProcessor {
    const model = this.userModelMap.get(userId) || "gemini";
    return model === "gemini" ? new GeminiProcessor() : new GptProcessor();
  }

  async processMessage(userId: string, text: string): Promise<ModelResponse> {
    try {
      const processor = this.getProcessor(userId);
      const response = await processor.processMessage(text);

      if (!response) {
        return { intent: "unknown", message: "🤖 Não entendi. Pode reformular?" };
      }

      // O userId é sempre o ID real do Telegram — a IA não o conhece.
      response.userId = userId;
      return response;
    } catch (error) {
      console.error("Erro ao processar a mensagem:", error);
      return { intent: "unknown", message: "🤖 Erro ao processar a mensagem." };
    }
  }

  // Processa a imagem direto no modelo (Fase 3). Retorna null se o modelo ativo
  // não suportar imagem — nesse caso o chamador usa o caminho OCR → texto.
  async processImage(userId: string, base64Image: string): Promise<ModelResponse | null> {
    const processor = this.getProcessor(userId);
    if (!processor.processImage) {
      return null;
    }

    try {
      const response = await processor.processImage(base64Image);
      if (!response) {
        return { intent: "unknown", message: "🤖 Não entendi. Pode reformular?" };
      }
      response.userId = userId;
      return response;
    } catch (error) {
      console.error("Erro ao processar a imagem:", error);
      return { intent: "unknown", message: "🤖 Erro ao processar a imagem." };
    }
  }
}
