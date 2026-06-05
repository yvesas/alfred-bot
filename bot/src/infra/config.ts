import dotenv from "dotenv";

dotenv.config();

const isProd = process.env.NODE_ENV === "production";

// Configuração central da aplicação. Lê o ambiente em um único lugar e expõe valores tipados.
// As obrigatórias são validadas no startup por assertRequiredConfig() (falha cedo e claro).
export const config = {
  isProd,

  // Obrigatórias
  databaseUrl: process.env.DATABASE_URL ?? "",
  telegramToken: process.env.TELEGRAM_TOKEN ?? "",

  // Por provider (validadas no uso)
  gcpProjectId: process.env.GCP_PROJECT_ID ?? "",
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  paddleOcrUrl: process.env.PADDLE_OCR_URL ?? "http://ocr:8000",

  // Login web (B1 — WorkOS AuthKit). Opcional: sem chaves, o login fica desligado.
  workosApiKey: process.env.WORKOS_API_KEY ?? "",
  workosClientId: process.env.WORKOS_CLIENT_ID ?? "",
  workosRedirectUri: process.env.WORKOS_REDIRECT_URI ?? "",
  // URL do app web (para onde o callback redireciona com o token). Ex.: http://localhost:8081
  webAppUrl: process.env.WEB_APP_URL ?? "",
  // Segredo para assinar o JWT de sessão emitido pelo bot.
  jwtSecret: process.env.JWT_SECRET ?? "",
  authPort: Number(process.env.AUTH_PORT) || 3001,

  // Com default
  platforms: (process.env.PLATFORMS ?? "telegram").toLowerCase(),
  whatsappSessionDir: process.env.WHATSAPP_SESSION_DIR ?? "./.wa-session",
  webPort: Number(process.env.WEB_PORT) || 3100,
  // Origens permitidas no WebSocket do chat web (CSV) ou "*". Em prod, defina a origem do front.
  webAllowedOrigin: process.env.WEB_ALLOWED_ORIGIN || "*",
  ocrProvider: (process.env.OCR_PROVIDER ?? "gemini").toLowerCase(),
  ocrMode: (process.env.OCR_MODE ?? "ocr").toLowerCase(),
  // Usa || (não ??) para que variáveis presentes porém VAZIAS no .env caiam no default.
  healthPort: Number(process.env.HEALTH_PORT) || 3000,
  // Pede confirmação ("sim/não") antes de salvar uma compra. Default: ligado.
  confirmPurchase: (process.env.CONFIRM_PURCHASE ?? "true").toLowerCase() !== "false",
  // Lembretes (push recorrente). Ligado por padrão; intervalo de verificação em ms.
  remindersEnabled: (process.env.REMINDERS_ENABLED ?? "true").toLowerCase() !== "false",
  reminderIntervalMs: Number(process.env.REMINDER_INTERVAL_MS) || 60_000,
  logLevel: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 20,
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  },
};

// Login web habilitado só quando todas as variáveis necessárias estão presentes.
// (apenas API key + client id não bastam: precisamos da redirect URI e do segredo do JWT)
export function isAuthEnabled(): boolean {
  return !!(
    config.workosApiKey &&
    config.workosClientId &&
    config.workosRedirectUri &&
    config.jwtSecret
  );
}

// Valida as variáveis essenciais no startup. Chamada em index.ts antes de subir o bot.
export function assertRequiredConfig(): void {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.telegramToken) missing.push("TELEGRAM_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`);
  }
}
