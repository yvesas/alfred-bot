import { Container } from "inversify";
import { Database } from "./Database";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ProductRepository } from "../repositories/ProductRepository";
import { UserRepository } from "../repositories/UserRepository";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { PurchaseService } from "../services/PurchaseService";
import { ProductService } from "../services/ProductService";
import { UserService } from "../services/UserService";
import { BudgetService } from "../services/BudgetService";
import { OcrService } from "../services/OcrService";
import { IOcrProvider, OCR_PROVIDER_TOKEN } from "../services/ocr/IOcrProvider";
import { VisionOcrProvider } from "../services/ocr/VisionOcrProvider";
import { GeminiOcrProvider } from "../services/ocr/GeminiOcrProvider";
import { PaddleOcrProvider } from "../services/ocr/PaddleOcrProvider";
import { MessageProcessingService } from "../services/MessageProcessingService";
import { GeminiProcessor } from "../services/GeminiProcessor";
import { GptProcessor } from "../services/GptProcessor";
import { RateLimiter } from "../services/RateLimiter";
import { ReminderService } from "../services/ReminderService";
import { ReminderScheduler } from "../services/ReminderScheduler";
import { OutboundRegistry } from "../core/OutboundRegistry";
import { BotCore } from "../core/BotCore";
import { TelegramAdapter } from "../platforms/telegram/TelegramAdapter";
import { WhatsAppAdapter } from "../platforms/whatsapp/WhatsAppAdapter";
import { WebAdapter } from "../platforms/web/WebAdapter";
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
container.bind<ReminderRepository>(ReminderRepository).toSelf();
container.bind<PurchaseService>(PurchaseService).toSelf();
container.bind<ProductService>(ProductService).toSelf();
container.bind<UserService>(UserService).toSelf();
container.bind<BudgetService>(BudgetService).toSelf();
container.bind<IOcrProvider>(OCR_PROVIDER_TOKEN).to(resolveOcrProvider());
container.bind<OcrService>(OcrService).toSelf();
container.bind<GeminiProcessor>(GeminiProcessor).toSelf();
container.bind<GptProcessor>(GptProcessor).toSelf();
container.bind<RateLimiter>(RateLimiter).toSelf().inSingletonScope();
container.bind<ReminderService>(ReminderService).toSelf();
container.bind<MessageProcessingService>(MessageProcessingService).toSelf();
// Singleton: a MESMA instância é compartilhada entre adapters (que registram o sendTo)
// e o ReminderScheduler (que resolve o sender pela plataforma).
container.bind<OutboundRegistry>(OutboundRegistry).toSelf().inSingletonScope();
container.bind<ReminderScheduler>(ReminderScheduler).toSelf().inSingletonScope();
container.bind<BotCore>(BotCore).toSelf().inSingletonScope();

container.bind(TelegramAdapter).toSelf().inSingletonScope();
container.bind(WhatsAppAdapter).toSelf().inSingletonScope();
container.bind(WebAdapter).toSelf().inSingletonScope();

export { container };
