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

  // Com default
  ocrProvider: (process.env.OCR_PROVIDER ?? "gemini").toLowerCase(),
  ocrMode: (process.env.OCR_MODE ?? "ocr").toLowerCase(),
  logLevel: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX ?? 20),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  },
};

// Valida as variáveis essenciais no startup. Chamada em index.ts antes de subir o bot.
export function assertRequiredConfig(): void {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.telegramToken) missing.push("TELEGRAM_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`);
  }
}
