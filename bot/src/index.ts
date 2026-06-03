import "reflect-metadata";
import { container } from "./infra/Container";
import { Database } from "./infra/Database";
import { TelegramAdapter } from "./platforms/telegram/TelegramAdapter";
import { IMessagingAdapter } from "./core/IMessagingAdapter";
import { assertRequiredConfig, config } from "./infra/config";
import { startHealthServer, setAppReady } from "./infra/health";
import { logger } from "./infra/logger";

// Resolve os adapters habilitados por PLATFORMS (ex.: "telegram,whatsapp").
function resolveAdapters(): IMessagingAdapter[] {
  const enabled = config.platforms.split(",").map((p) => p.trim());
  const adapters: IMessagingAdapter[] = [];

  if (enabled.includes("telegram")) adapters.push(container.get(TelegramAdapter));
  // if (enabled.includes("whatsapp")) adapters.push(container.get(WhatsAppAdapter)); // Fase 3

  return adapters;
}

async function main() {
  // Falha cedo e claro se faltar variável de ambiente obrigatória.
  assertRequiredConfig();

  // Sobe cedo: o liveness (/health) já responde durante a inicialização.
  const healthServer = startHealthServer();

  const db = container.get(Database);
  await db.connect();

  // Sobe cada adapter de forma isolada: a falha de um não impede os outros.
  const adapters = resolveAdapters();
  await Promise.allSettled(
    adapters.map((a) =>
      a
        .start()
        .catch((err) => logger.error({ err }, `Adapter ${a.constructor.name} falhou ao iniciar`)),
    ),
  );

  setAppReady(true);
  logger.info("🚀 Bot is ready!");

  // Encerramento limpo quando o host envia sinal de parada (ex.: deploy/stop de container).
  const shutdown = async (signal: string) => {
    logger.info(`🛑 Encerrando (${signal})...`);
    setAppReady(false);
    await Promise.allSettled(adapters.map((a) => a.stop()));
    healthServer.close();
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Falha ao iniciar o bot");
  process.exit(1);
});
