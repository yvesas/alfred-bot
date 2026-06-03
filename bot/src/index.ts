import "reflect-metadata";
import { container } from "./infra/Container";
import { Database } from "./infra/Database";
import { TelegramBot } from "./services/TelegramBot";

async function main() {
  const db = container.get(Database);
  await db.connect();

  const bot = container.get(TelegramBot);
  console.log("🚀 Bot is ready!");

  // Encerramento limpo quando o host envia sinal de parada (ex.: deploy/stop de container).
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((err) => {
  console.error("❌ Falha ao iniciar o bot:", err);
  process.exit(1);
});
