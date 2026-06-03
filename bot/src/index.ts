import "reflect-metadata";
import { container } from "./infra/Container";
import { Database } from "./infra/Database";
import { TelegramBot } from "./services/TelegramBot";
import { assertRequiredConfig } from "./infra/config";
import { logger } from "./infra/logger";

async function main() {
  // Falha cedo e claro se faltar variável de ambiente obrigatória.
  assertRequiredConfig();

  const db = container.get(Database);
  await db.connect();

  const bot = container.get(TelegramBot);
  logger.info("🚀 Bot is ready!");

  // Encerramento limpo quando o host envia sinal de parada (ex.: deploy/stop de container).
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Falha ao iniciar o bot");
  process.exit(1);
});
