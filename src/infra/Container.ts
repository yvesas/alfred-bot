import { Container } from "inversify";
import { Database } from "./Database";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ProductRepository } from "../repositories/ProductRepository";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseService } from "../services/PurchaseService";
import { ProductService } from "../services/ProductService";
import { UserService } from "../services/UserService";
import { OcrService } from "../services/OcrService";
import { TelegramBot } from "../services/TelegramBot";
import { MessageProcessingService } from "../services/MessageProcessingService";

const container = new Container();
container.bind<Database>(Database).toSelf();
container.bind<PurchaseRepository>(PurchaseRepository).toSelf();
container.bind<ProductRepository>(ProductRepository).toSelf();
container.bind<UserRepository>(UserRepository).toSelf();
container.bind<PurchaseService>(PurchaseService).toSelf();
container.bind<ProductService>(ProductService).toSelf();
container.bind<UserService>(UserService).toSelf();
container.bind<OcrService>(OcrService).toSelf();
container.bind<MessageProcessingService>(MessageProcessingService).toSelf();

container.bind(TelegramBot).toSelf().inSingletonScope();

export { container };
