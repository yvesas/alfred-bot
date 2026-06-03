import { inject, injectable } from "inversify";
import { GptProcessor } from "./GptProcessor";
import { GeminiProcessor } from "./GeminiProcessor";
import { IPurchaseItem, IStoreInfo, ITaxInfo } from "../models/Purchase";
import { AiModel } from "../models/User";
import { UserRepository } from "../repositories/UserRepository";
import { logger } from "../infra/logger";

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
  constructor(
    @inject(GeminiProcessor) private geminiProcessor: GeminiProcessor,
    @inject(GptProcessor) private gptProcessor: GptProcessor,
    @inject(UserRepository) private userRepo: UserRepository,
  ) {}

  // Persiste a escolha do modelo de IA no usuário (sobrevive a reinício do bot).
  async setUserModel(userId: string, model: string): Promise<string> {
    if (model !== "gpt" && model !== "gemini") {
      return `Modelo inválido! Escolha entre "gpt" ou "gemini".`;
    }

    await this.userRepo.update(userId, { aiModel: model as AiModel });
    return `🤖 Modelo atualizado para ${model.toUpperCase()}!`;
  }

  // Seleciona o processador conforme a preferência salva do usuário (default: gemini).
  private async getProcessor(userId: string): Promise<IMessageProcessor> {
    const user = await this.userRepo.findByTelegramId(userId);
    const model: AiModel = user?.aiModel ?? "gemini";
    return model === "gpt" ? this.gptProcessor : this.geminiProcessor;
  }

  async processMessage(userId: string, text: string): Promise<ModelResponse> {
    try {
      const processor = await this.getProcessor(userId);
      const response = await processor.processMessage(text);

      if (!response) {
        return { intent: "unknown", message: "🤖 Não entendi. Pode reformular?" };
      }

      // O userId é sempre o ID real do Telegram — a IA não o conhece.
      response.userId = userId;
      return response;
    } catch (error) {
      logger.error({ err: error }, "Erro ao processar a mensagem");
      return { intent: "unknown", message: "🤖 Erro ao processar a mensagem." };
    }
  }

  // Processa a imagem direto no modelo (Fase 3). Retorna null se o modelo ativo
  // não suportar imagem — nesse caso o chamador usa o caminho OCR → texto.
  async processImage(userId: string, base64Image: string): Promise<ModelResponse | null> {
    const processor = await this.getProcessor(userId);
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
      logger.error({ err: error }, "Erro ao processar a imagem");
      return { intent: "unknown", message: "🤖 Erro ao processar a imagem." };
    }
  }
}
