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
import { TelegramBot } from "../services/TelegramBot";
import { MessageProcessingService } from "../services/MessageProcessingService";

// Seleciona o provedor de OCR por variável de ambiente.
// Fase 1: apenas o Vision está implementado. Gemini (Fase 2) e Paddle (Fase 4) entram depois;
// até lá, qualquer valor diferente cai no Vision com um aviso.
function resolveOcrProvider(): new () => IOcrProvider {
  const choice = (process.env.OCR_PROVIDER ?? "vision").toLowerCase();
  switch (choice) {
    case "vision":
      return VisionOcrProvider;
    default:
      console.warn(`OCR_PROVIDER="${choice}" ainda não implementado; usando Vision.`);
      return VisionOcrProvider;
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
container.bind<MessageProcessingService>(MessageProcessingService).toSelf();

container.bind(TelegramBot).toSelf().inSingletonScope();

export { container };
