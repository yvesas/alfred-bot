import "reflect-metadata";
import { container } from "./infra/Container";
import { Database } from "./infra/Database";
import { TelegramAdapter } from "./platforms/telegram/TelegramAdapter";
import { WhatsAppAdapter } from "./platforms/whatsapp/WhatsAppAdapter";
import { WebAdapter } from "./platforms/web/WebAdapter";
import { IMessagingAdapter } from "./core/IMessagingAdapter";
import { ReminderScheduler } from "./services/ReminderScheduler";
import { RetentionScheduler } from "./services/RetentionScheduler";
import { AuthServer } from "./infra/authServer";
import { assertRequiredConfig, config, isAuthEnabled } from "./infra/config";
import { startHealthServer, setAppReady } from "./infra/health";
import { logger } from "./infra/logger";

// Resolve os adapters habilitados por PLATFORMS (ex.: "telegram,whatsapp").
function resolveAdapters(): IMessagingAdapter[] {
  const enabled = config.platforms.split(",").map((p) => p.trim());
  const adapters: IMessagingAdapter[] = [];

  if (enabled.includes("telegram")) adapters.push(container.get(TelegramAdapter));
  if (enabled.includes("whatsapp")) adapters.push(container.get(WhatsAppAdapter));
  if (enabled.includes("web")) adapters.push(container.get(WebAdapter));

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

  // Lembretes: sobe DEPOIS dos adapters (que registram o outbound sender no start()).
  const scheduler = container.get(ReminderScheduler);
  if (config.remindersEnabled) {
    scheduler.start();
  }

  // Retenção (LGPD): purga sessões anônimas inativas. Desligado por padrão.
  const retentionScheduler = container.get(RetentionScheduler);
  if (config.retentionEnabled) {
    retentionScheduler.start();
  }

  // Login web (WorkOS): só sobe quando totalmente configurado.
  const authServer = container.get(AuthServer);
  if (isAuthEnabled()) {
    authServer.start();
  } else if (config.workosApiKey || config.workosClientId) {
    logger.warn("Login web desabilitado: defina WORKOS_API_KEY, WORKOS_CLIENT_ID e JWT_SECRET.");
  }

  setAppReady(true);
  logger.info("🚀 Bot is ready!");

  // Encerramento limpo quando o host envia sinal de parada (ex.: deploy/stop de container).
  const shutdown = async (signal: string) => {
    logger.info(`🛑 Encerrando (${signal})...`);
    setAppReady(false);
    scheduler.stop();
    retentionScheduler.stop();
    authServer.stop();
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
