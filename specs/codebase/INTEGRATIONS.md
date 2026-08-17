# Integrações externas

**Analisado:** 2026-08-14 · Toda configuração passa por `bot/src/infra/config.ts`.
Nenhuma credencial vive no código — ver `.env.sample` de cada projeto.

## Plataformas de mensagem

### Telegram — Telegraf (long-polling)

**Onde:** `bot/src/platforms/telegram/TelegramAdapter.ts`
**Config:** `TELEGRAM_TOKEN` (obrigatória, validada no startup) ·
`TELEGRAM_BOT_USERNAME` (sem `@`, só para o deep-link de vínculo)
**Auth:** token do BotFather.
**Ligada por:** `PLATFORMS` contendo `telegram` (default).
**Como funciona:** long-polling — `bot.launch()` **não** é aguardado (só resolve
quando o bot para). Sem webhook, sem URL pública.
**Recursos usados:** comandos nativos (17 registrados), `on("text"|"photo"|"contact")`,
teclado de solicitação de contato, `replyWithDocument` (CSV).
**Download de foto:** `getFile` → `https://api.telegram.org/file/bot<token>/<path>`
via `fetch` → base64.
**Push:** `sendMessage(chatId)` — o `externalId` **é** o chat id.

### WhatsApp — Baileys (não-oficial)

**Onde:** `bot/src/platforms/whatsapp/WhatsAppAdapter.ts`
**Config:** `WHATSAPP_SESSION_DIR` (default `./.wa-session`) ·
`WHATSAPP_BOT_NUMBER` (só dígitos, para o deep-link)
**Auth:** **QR code no terminal** (`qrcode-terminal`), sessão multi-arquivo
persistida em disco (volume `wa-session` no compose).
**Ligada por:** `PLATFORMS` contendo `whatsapp`.
**Escopo:** só conversa direta — ignora grupos, status e mensagens próprias.
**Reconexão:** automática no `connection.close`, exceto em `loggedOut` (exige
apagar a sessão e ler um QR novo).
**Push:** `sendMessage("<numero>@s.whatsapp.net")`.
**Efeito colateral relevante:** o `externalId` **é** o número verificado pela
operadora, então o WhatsApp alimenta `verifiedPhone` e dispara auto-vínculo.
⚠️ Biblioteca de engenharia reversa — ver `CONCERNS.md`.

### Web — WebSocket próprio (`ws`)

**Onde:** `bot/src/platforms/web/WebAdapter.ts` ↔ `web/src/features/chat/hooks/useChatSocket.ts`
**Config (servidor):** `WEB_PORT` (3100) · `WEB_ALLOWED_ORIGIN` (CSV ou `*`)
**Config (cliente, build-time):** `VITE_WS_URL`
**Auth:** opcional. Com JWT válido no payload, a identidade vira o `sub` do WorkOS;
sem token, segue anônima pelo `clientId` (gerado e guardado no navegador).
**Protocolo:** JSON em ambas as direções.
Cliente → `{ type: "user_message"|"user_photo", clientId, token?, text?|imageBase64? }`
Servidor → `{ type: "bot_message"|"typing"|"error"|"download" }`
**Proteções:** allowlist de `Origin` no handshake, payload máximo de 8 MB.
**Reconexão:** o cliente reconecta sozinho a cada 2 s.

## IA

### Google Gemini via Vertex AI — **padrão**

**Onde:** `services/GeminiProcessor.ts` (extração) e `services/ocr/GeminiOcrProvider.ts` (OCR)
**Config:** `GCP_PROJECT_ID` · `GOOGLE_APPLICATION_CREDENTIALS` (ADC)
**Modelo:** `gemini-2.0-flash-lite-001`, região `us-central1` — **hardcoded** nos dois arquivos.
**Auth:** service account JSON (Application Default Credentials).
**Uso:** `generateContent` com o prompt de `IA/prompts.ts`; multimodal (`inlineData`
+ texto) quando `OCR_MODE=multimodal`, que é o caminho principal para foto de cupom.

### OpenAI GPT — alternativa por usuário

**Onde:** `services/GptProcessor.ts`
**Config:** `OPENAI_API_KEY`
**Modelo:** `gpt-4-turbo` — **hardcoded**; `temperature: 0.2`,
`response_format: { type: "json_object" }`.
**Uso:** escolhido por `/ia gpt` (persistido em `User.aiModel`). **Não implementa
`processImage`** — com GPT ativo, foto sempre passa pelo caminho OCR → texto.

### Fallback cruzado

`MessageProcessingService.processMessage` captura a falha do modelo primário,
incrementa `alfred_bot_ai_errors_total` e tenta o **outro** modelo antes de
devolver erro ao usuário (B7). Vale só para texto — `processImage` não faz fallback.

## OCR

Um único contrato (`IOcrProvider`) e três implementações, escolhidas por
`OCR_PROVIDER` na factory de `infra/Container.ts`. Valor desconhecido → warn + Gemini.

| Provider | Config | Custo | Estado |
|---|---|---|---|
| `gemini` (**default**) | `GCP_PROJECT_ID` | baixo | em uso |
| `vision` (Google Cloud Vision) | `GOOGLE_APPLICATION_CREDENTIALS` | maior | funcional, não usado |
| `paddle` (self-hosted) | `PADDLE_OCR_URL` (default `http://ocr:8000`) | infra própria | **imagem nunca buildada** |

`OCR_MODE=multimodal` curto-circuita o OCR: a imagem vai direto ao modelo e
volta JSON numa chamada só. `OCR_MODE=ocr` usa o caminho de duas etapas.

Os três providers **nunca lançam** — devolvem `"Erro ao processar a imagem."`
como texto, e o erro só aparece no log.

### `ocr-service/` — microserviço próprio

FastAPI + PaddleOCR (`lang="pt"`, `use_angle_cls=True`), modelo carregado uma vez
no startup. `GET /health` · `POST /ocr {image: base64}` →
`{text, lines[{text, confidence}], ms}`. Sem autenticação — vive só na rede
interna do compose. Sobe com `--profile paddle`, limite de 2 GB de RAM.

## Autenticação — WorkOS

**Onde:** `services/AuthService.ts` (SDK) e `infra/authServer.ts` (HTTP)
**Config:** `WORKOS_API_KEY` · `WORKOS_CLIENT_ID` · `JWT_SECRET` (os três são o
gate de `isAuthEnabled()`) · `WORKOS_REDIRECT_URI` e `WEB_APP_URL` (só para o
fluxo hospedado) · `AUTH_PORT` (3001)
**Fluxo principal — Magic Auth (e-mail + OTP), telas próprias:**
`createMagicAuth({email})` envia o código · `authenticateWithMagicAuth({email, code})`
valida e devolve o perfil. **Não exige redirect URI.**
**Fluxo secundário (legado):** AuthKit hospedado — `getAuthorizationUrl` +
`authenticateWithCode`, com `state` carregando o `clientId` anônimo em base64url.
**Sessão:** JWT próprio de 30 dias (`sub` = id do WorkOS), assinado com
`JWT_SECRET` — o WorkOS não é consultado de novo depois do login.
**Degradação:** sem chaves, o login web simplesmente não sobe (warn no startup) e
o `/email` do chat responde "verificação indisponível".

## API HTTP

Servida por `node:http` puro em `infra/authServer.ts`, porta `AUTH_PORT` (3001).
CORS liberado para `WEB_APP_URL` (ou `*`). Autenticação por `Authorization: Bearer <JWT>`.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/email/start` | envia o código OTP |
| POST | `/auth/email/verify` | valida, garante a conta, absorve o anônimo, devolve o JWT |
| GET | `/auth/login`, `/auth/callback` | fluxo AuthKit hospedado (legado) |
| GET | `/auth/link/telegram`, `/auth/link/whatsapp` | 302 para o deep-link com token de vínculo |
| GET | `/api/me` | perfil, plano, uso do mês, plataformas vinculadas |
| GET | `/api/report` | painel: mês atual, mês passado, série de 6 meses |
| GET | `/api/export.csv` | CSV das compras (com BOM, para o Excel) |
| PATCH | `/api/profile` | altera o nome (direito de correção, LGPD) |
| DELETE | `/api/account` | exclui conta e dados (LGPD) |

**Health/métricas** ficam em outro servidor, `infra/health.ts`, porta
`HEALTH_PORT` (3000): `/health` (liveness), `/ready` (readiness + estado do
Mongo), `/metrics` (Prometheus).

## Banco de dados

**MongoDB** via Mongoose. `DATABASE_URL` é obrigatória e validada no startup.
`Database.connect()` **não** engole erro (o `index.ts` aborta com `exit 1`) e
registra listeners de `error`/`disconnected`/`reconnected`.
Dev: container `mongo:7` do compose. Produção: Atlas (via env do host).

**Índices que importam:**
`User` — `{identities.platform, identities.externalId}` único esparso ·
`telegramId` único esparso (legado) · `verifiedEmail` e `verifiedPhone` esparsos
(não-únicos: durante o merge duas contas podem coexistir).
`Purchase` — `{userId, fiscalKey}` único **parcial** (só documentos com
`fiscalKey`), que é o que impede registrar o mesmo cupom duas vezes.

## Webhooks

**Nenhum.** Telegram usa long-polling, WhatsApp usa socket persistente e o WorkOS
é consultado de forma síncrona. Não há endpoint público recebendo callback de
terceiro (o `/auth/callback` é navegação do usuário, não webhook).

## Jobs de background

Sem fila e sem broker — dois `setInterval` no mesmo processo, ambos com `unref()`
para não segurar o encerramento, ambos com `try/catch` no tick.

| Job | Intervalo | Ligado por | O que faz |
|---|---|---|---|
| `ReminderScheduler` | `REMINDER_INTERVAL_MS` (60 s) | `REMINDERS_ENABLED` (**on**) | busca lembretes vencidos, envia pelo `OutboundRegistry`, reprograma para o mês seguinte |
| `RetentionScheduler` | `RETENTION_INTERVAL_MS` (24 h) | `RETENTION_ENABLED` (**off**) | purga sessões web anônimas inativas há `ANON_RETENTION_DAYS` (90) |

⚠️ Ambos rodam **em toda instância**. Com mais de uma réplica, os lembretes
duplicam — ver `CONCERNS.md`.

## Observabilidade

**Prometheus** — `GET /metrics` com as métricas padrão do Node (prefixo
`alfred_bot_`) mais quatro da aplicação: `messages_received_total{platform,kind}`,
`purchases_registered_total`, `ai_errors_total`, `reminders_sent_total{platform}`.
**Grafana** — perfil `monitoring` do compose, UI em `:3002`. **Sem dashboard criado.**

## Estado em memória (não persistido)

Reinício ou segunda réplica perde tudo isto:

| O quê | Onde | Impacto |
|---|---|---|
| Compras aguardando "sim/não" | `BotCore.pendingPurchases` | usuário precisa reenviar |
| E-mails aguardando código | `BotCore.pendingEmailVerification` | `/codigo` responde "sem pendente" |
| Tokens de vínculo (TTL 10 min) | `LinkTokenService` | deep-link expira antes da hora |
| Janela do rate limit | `RateLimiter` | limite reinicia |
| Senders por plataforma | `OutboundRegistry` | reconstruído no `start()` de cada adapter |
