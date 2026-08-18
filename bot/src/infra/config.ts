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

  // Deep-links de vínculo (Fase 6). Username do bot do Telegram (sem @) e número do bot no
  // WhatsApp (só dígitos). Vazios = o respectivo botão de vínculo fica indisponível.
  telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, ""),
  whatsappBotNumber: (process.env.WHATSAPP_BOT_NUMBER ?? "").replace(/[^\d]/g, ""),

  // Por provider (validadas no uso)
  gcpProjectId: process.env.GCP_PROJECT_ID ?? "",
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  paddleOcrUrl: process.env.PADDLE_OCR_URL ?? "http://ocr:8000",

  // ---- Modelos de IA ----
  // Id de modelo é o fato que envelhece mais rápido neste sistema: fornecedor aposenta
  // modelo com data marcada. Ficar hardcoded custou caro — o `gemini-2.0-flash-lite-001`
  // foi desligado no Vertex AI em 2026-06-01 e o bot parou sem ninguém ver. Aqui, trocar
  // de modelo é variável de ambiente; a próxima aposentadoria não pede deploy.
  // Ver docs/adr/0003-ia-e-ocr-atras-de-interface.md e C0 em specs/codebase/CONCERNS.md.
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  geminiLocation: process.env.GEMINI_LOCATION || "us-central1",
  // Modelo que lê a imagem do cupom. Separado do de texto de propósito: a extração de
  // cupom é a chamada cara e pode justificar um modelo diferente da conversa.
  geminiVisionModel:
    process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.6-terra",

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
  // Plano free: máximo de compras registradas por mês (acima disso, sugere o pro).
  freeMonthlyPurchaseLimit: Number(process.env.FREE_MONTHLY_PURCHASE_LIMIT) || 50,
  // LGPD: versão atual da Política de Privacidade (consentimento) e e-mail de contato/DPO.
  privacyPolicyVersion: "2026-06-05",
  privacyContactEmail: process.env.PRIVACY_CONTACT_EMAIL || "privacidade@exemplo.com",
  // LGPD — retenção: apaga sessões web ANÔNIMAS inativas (nunca logaram). Desligado por padrão.
  retentionEnabled: (process.env.RETENTION_ENABLED ?? "false").toLowerCase() === "true",
  anonRetentionDays: Number(process.env.ANON_RETENTION_DAYS) || 90,
  retentionIntervalMs: Number(process.env.RETENTION_INTERVAL_MS) || 24 * 60 * 60 * 1000,
  logLevel: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 20,
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  },
  // Validade do estado que atravessa duas mensagens (C2). Antes viviam num Map e
  // duravam o processo inteiro; num banco precisam vencer, senão a coleção cresce para
  // sempre. Uma hora é conversa longa; e-mail acompanha a validade do código.
  pendingPurchaseTtlMs: Number(process.env.PENDING_PURCHASE_TTL_MS) || 60 * 60_000,
  pendingEmailTtlMs: Number(process.env.PENDING_EMAIL_TTL_MS) || 15 * 60_000,
  linkTokenTtlMs: Number(process.env.LINK_TOKEN_TTL_MS) || 10 * 60_000,
  // Quantas réplicas do bot rodam. O rate limit é o único estado que ficou em memória
  // — ida ao banco por requisição custaria caro — então o teto é dividido por aqui,
  // para que N instâncias somem o limite configurado em vez de multiplicá-lo.
  replicas: Math.max(1, Number(process.env.REPLICAS) || 1),
  // Confiar em `x-forwarded-for` só quando há proxy declarado. Sem isto, o cliente
  // forja o próprio IP e o rate limit vira decoração.
  trustProxy: (process.env.TRUST_PROXY ?? "false").toLowerCase() === "true",
  // Rate limit do AuthServer, por IP. Separado do rate limit do chat: o chat é
  // conversa humana, o HTTP é superfície aberta à internet (C6).
  httpRateLimit: {
    max: Number(process.env.HTTP_RATE_LIMIT_MAX) || 60,
    windowMs: Number(process.env.HTTP_RATE_LIMIT_WINDOW_MS) || 60_000,
  },
  // Bem mais apertado: cada chamada a /auth/email/start dispara um e-mail real pelo
  // WorkOS. Sem teto, dá para queimar a cota e usar o Alfred para spammar terceiros.
  authEmailRateLimit: {
    max: Number(process.env.AUTH_EMAIL_RATE_LIMIT_MAX) || 5,
    windowMs: Number(process.env.AUTH_EMAIL_RATE_LIMIT_WINDOW_MS) || 15 * 60_000,
  },
};

// Login web habilitado quando dá para autenticar (WorkOS Magic Auth) e assinar a sessão.
// A redirect URI NÃO é necessária no fluxo de e-mail+OTP (telas próprias); ela só é usada pelo
// fluxo hospedado/social opcional do AuthKit.
export function isAuthEnabled(): boolean {
  return !!(config.workosApiKey && config.workosClientId && config.jwtSecret);
}

// Valida as variáveis essenciais no startup. Chamada em index.ts antes de subir o bot.
export function assertRequiredConfig(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.telegramToken) missing.push("TELEGRAM_TOKEN");

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`);
  }

  assertProductionOrigins(env);
}

// C7 — em produção, origem tem que ser explícita.
//
// `WEB_ALLOWED_ORIGIN` (WebSocket) e `WEB_APP_URL` (CORS da API) caem em "*" quando
// não definidas. Isso é conveniente em desenvolvimento e é uma falha **aberta** em
// produção: esquecer a variável libera o chat e a API para qualquer site. Aqui o
// esquecimento vira erro no startup, com a lista do que falta — não uma brecha
// silenciosa. Em desenvolvimento segue permissivo.
export function assertProductionOrigins(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const open: string[] = [];
  if (!env.WEB_ALLOWED_ORIGIN || env.WEB_ALLOWED_ORIGIN.trim() === "*") {
    open.push("WEB_ALLOWED_ORIGIN");
  }
  if (!env.WEB_APP_URL || env.WEB_APP_URL.trim() === "*") {
    open.push("WEB_APP_URL");
  }

  if (open.length > 0) {
    throw new Error(
      `Em produção, defina uma origem explícita (nunca "*") para: ${open.join(", ")}. ` +
        `Sem isso o WebSocket e a API aceitam qualquer site.`,
    );
  }
}
