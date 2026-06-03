import { Container } from "inversify";
import { Database } from "./Database";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ProductRepository } from "../repositories/ProductRepository";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseService } from "../services/PurchaseService";
import { ProductService } from "../services/ProductService";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { IOcrProvider, OCR_PROVIDER_TOKEN } from "../services/ocr/IOcrProvider";
import { VisionOcrProvider } from "../services/ocr/VisionOcrProvider";
import { GeminiOcrProvider } from "../services/ocr/GeminiOcrProvider";
import { PaddleOcrProvider } from "../services/ocr/PaddleOcrProvider";
import { MessageProcessingService } from "../services/MessageProcessingService";
import { GeminiProcessor } from "../services/GeminiProcessor";
import { GptProcessor } from "../services/GptProcessor";
import { RateLimiter } from "../services/RateLimiter";
import { BotCore } from "../core/BotCore";
import { TelegramAdapter } from "../platforms/telegram/TelegramAdapter";
import { WhatsAppAdapter } from "../platforms/whatsapp/WhatsAppAdapter";
import { logger } from "./logger";
import { config } from "./config";

// Seleciona o provedor de OCR por variável de ambiente.
// Padrão: Gemini multimodal (menor custo, sem credencial extra).
// "vision" (Google) e "paddle" (self-host via microserviço) são selecionáveis por env.
function resolveOcrProvider(): new () => IOcrProvider {
  const choice = config.ocrProvider;
  switch (choice) {
    case "vision":
      return VisionOcrProvider;
    case "gemini":
      return GeminiOcrProvider;
    case "paddle":
      return PaddleOcrProvider;
    default:
      logger.warn(`OCR_PROVIDER="${choice}" desconhecido; usando Gemini.`);
      return GeminiOcrProvider;
  }
}

const container = new Container();
container.bind<Database>(Database).toSelf();
container.bind<PurchaseRepository>(PurchaseRepository).toSelf();
container.bind<ProductRepository>(ProductRepository).toSelf();
container.bind<UserRepository>(UserRepository).toSelf();
container.bind<PurchaseService>(PurchaseService).toSelf();
container.bind<ProductService>(ProductService).toSelf();
container.bind<UserService>(UserService).toSelf();
container.bind<IOcrProvider>(OCR_PROVIDER_TOKEN).to(resolveOcrProvider());
container.bind<OcrService>(OcrService).toSelf();
container.bind<GeminiProcessor>(GeminiProcessor).toSelf();
container.bind<GptProcessor>(GptProcessor).toSelf();
container.bind<RateLimiter>(RateLimiter).toSelf().inSingletonScope();
container.bind<MessageProcessingService>(MessageProcessingService).toSelf();
container.bind<BotCore>(BotCore).toSelf().inSingletonScope();

container.bind(TelegramAdapter).toSelf().inSingletonScope();
container.bind(WhatsAppAdapter).toSelf().inSingletonScope();

export { container };
