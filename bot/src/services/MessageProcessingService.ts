import { inject, injectable } from "inversify";
import { GptProcessor } from "./GptProcessor";
import { GeminiProcessor } from "./GeminiProcessor";
import { IPurchaseItem, IStoreInfo, ITaxInfo } from "../models/Purchase";
import { AiModel, Language } from "../models/User";
import { Platform } from "../core/IncomingMessage";
import { UserRepository } from "../repositories/UserRepository";
import { logger } from "../infra/logger";
import { aiErrorsTotal } from "../infra/metrics";
import { languageLabel, t } from "../i18n";

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
  accessKey?: string; // chave de acesso da NFC-e (44 díg), quando a IA/QR a identifica
}

export interface IMessageProcessor {
  processMessage(
    message: string,
    categories?: string[],
    lang?: string,
  ): Promise<ModelResponse | null>;
  // Opcional: modelos multimodais leem a imagem direto (OCR + extração em uma chamada).
  processImage?(
    base64Image: string,
    categories?: string[],
    lang?: string,
  ): Promise<ModelResponse | null>;
}

@injectable()
export class MessageProcessingService {
  constructor(
    @inject(GeminiProcessor) private geminiProcessor: GeminiProcessor,
    @inject(GptProcessor) private gptProcessor: GptProcessor,
    @inject(UserRepository) private userRepo: UserRepository,
  ) {}

  // Persiste a escolha do modelo de IA no usuário (sobrevive a reinício do bot).
  async setUserModel(
    platform: Platform,
    externalId: string,
    model: string,
    lang: Language = "pt",
  ): Promise<string> {
    if (model !== "gpt" && model !== "gemini") {
      return t(lang, "ia_invalid");
    }

    await this.userRepo.updateByIdentity(platform, externalId, { aiModel: model as AiModel });
    return t(lang, "ia_set", { model: model.toUpperCase() });
  }

  // Resolve o processador (modelo), as categorias personalizadas e o idioma do usuário.
  private async resolveProcessor(
    platform: Platform,
    externalId: string,
  ): Promise<{
    processor: IMessageProcessor;
    categories: string[];
    language: string;
    lang: Language;
    userId: string;
  }> {
    const user = await this.userRepo.findByIdentity(platform, externalId);
    const model: AiModel = user?.aiModel ?? "gemini";
    const processor = model === "gpt" ? this.gptProcessor : this.geminiProcessor;
    const lang: Language = user?.language ?? "pt";
    return {
      processor,
      categories: user?.categories ?? [],
      language: languageLabel(lang), // rótulo p/ o prompt da IA
      lang, // código p/ o catálogo i18n
      // Identidade canônica: a compra pertence ao User._id (Fase 6), não ao externalId.
      // Fallback ao externalId só se o usuário ainda não existir (não deve ocorrer no fluxo normal).
      userId: user ? String(user._id) : externalId,
    };
  }

  async processMessage(
    platform: Platform,
    externalId: string,
    text: string,
  ): Promise<ModelResponse> {
    const { processor, categories, language, lang, userId } = await this.resolveProcessor(
      platform,
      externalId,
    );
    try {
      const response = await processor.processMessage(text, categories, language);

      if (!response) {
        return { intent: "unknown", message: t(lang, "ai_not_understood") };
      }

      // Chaveia a compra pelo User._id canônico (a IA não conhece o id).
      response.userId = userId;
      return response;
    } catch (error) {
      // B7: o modelo primário falhou → tenta o alternativo (gemini↔gpt) antes de desistir.
      aiErrorsTotal.inc();
      logger.warn({ err: error }, "Modelo primário falhou; tentando o alternativo");
      const fallback =
        processor === this.geminiProcessor ? this.gptProcessor : this.geminiProcessor;
      try {
        const response = await fallback.processMessage(text, categories, language);
        if (response) {
          response.userId = userId;
          return response;
        }
      } catch (fallbackError) {
        aiErrorsTotal.inc();
        logger.error({ err: fallbackError }, "Modelo alternativo também falhou");
      }
      return { intent: "unknown", message: t(lang, "ai_error") };
    }
  }

  // Processa a imagem direto no modelo (Fase 3). Retorna null se o modelo ativo
  // não suportar imagem — nesse caso o chamador usa o caminho OCR → texto.
  async processImage(
    platform: Platform,
    externalId: string,
    base64Image: string,
  ): Promise<ModelResponse | null> {
    const { processor, categories, language, lang, userId } = await this.resolveProcessor(
      platform,
      externalId,
    );
    if (!processor.processImage) {
      return null;
    }

    try {
      const response = await processor.processImage(base64Image, categories, language);
      if (!response) {
        return { intent: "unknown", message: t(lang, "ai_not_understood") };
      }
      response.userId = userId;
      return response;
    } catch (error) {
      aiErrorsTotal.inc();
      logger.error({ err: error }, "Erro ao processar a imagem");
      return { intent: "unknown", message: t(lang, "ai_error") };
    }
  }
}
