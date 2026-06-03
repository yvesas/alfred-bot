import "reflect-metadata";
import { injectable } from "inversify";
import mongoose from "mongoose";
import { config } from "./config";
import { logger } from "./logger";

@injectable()
export class Database {
  public async connect(): Promise<void> {
    // Eventos de ciclo de vida da conexão (reconexão é automática no mongoose).
    mongoose.connection.on("error", (err) => logger.error({ err }, "Erro na conexão do MongoDB"));
    mongoose.connection.on("disconnected", () => logger.warn("MongoDB desconectado"));
    mongoose.connection.on("reconnected", () => logger.info("MongoDB reconectado"));

    // Sem try/catch: a falha na conexão inicial deve propagar para o index.ts abortar (exit 1).
    await mongoose.connect(config.databaseUrl);
    logger.info("✅ Conectado ao MongoDB");
  }
}
