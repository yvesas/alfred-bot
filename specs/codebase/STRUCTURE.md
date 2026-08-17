# Estrutura do projeto

**Analisado:** 2026-08-14 · **Raiz:** `alfred/alfred-bot` (repo `yvesas/alfred-bot`)

## Árvore

```
alfred-bot/
├── CLAUDE.md                  índice para o agente
├── README.md                  o que é, como rodar
├── docker-compose.yml         bot + web + mongo (+ perfis paddle, monitoring)
├── .githooks/commit-msg       bloqueia atribuição de IA no commit
├── .github/workflows/         bot.yml · web.yml · ocr-service.yml (path-filtered)
├── monitoring/                prometheus.yml (perfil monitoring)
├── docs/                      como o sistema É
│   ├── architecture.md
│   ├── decisions.md
│   ├── adr/                   decisões estruturais, uma por arquivo
│   └── runbooks/              operação, uso e teste
├── specs/                     o PLANO
│   ├── codebase/              este mapeamento (7 arquivos)
│   ├── project/               PROJECT · ROADMAP · STATE
│   └── features/NNNN-slug/    spec · design · tasks
│
├── bot/                       ── aplicação principal (TypeScript) ──
│   ├── src/
│   │   ├── index.ts           bootstrap: config → health → db → adapters → jobs
│   │   ├── core/              BotCore + contratos de plataforma
│   │   ├── platforms/         telegram/ · whatsapp/ · web/
│   │   ├── services/          regra de negócio (+ ocr/ com os providers)
│   │   ├── repositories/      acesso a dados (Mongoose)
│   │   ├── models/            schemas: User · Purchase · Product · Reminder
│   │   ├── infra/             config · Container · Database · logger · metrics
│   │   │   ├── health.ts      servidor :3000 — /health /ready /metrics
│   │   │   ├── authServer.ts  servidor :3001 — login OTP + API do painel
│   │   │   └── converters/    normalização do JSON da IA → domínio
│   │   ├── i18n/index.ts      catálogo pt/en/es tipado
│   │   ├── IA/prompts.ts      prompt único (getPrompt001)
│   │   ├── utils/             fiscalKey · validation · errors
│   │   ├── scripts/           migrateCanonical.ts (migração pontual)
│   │   ├── config/            google-credentials.json (LOCAL, gitignored)
│   │   └── tests/             33 suítes + helpers/memoryMongo.ts
│   ├── .husky/                pre-commit e pre-push dos DOIS projetos
│   └── Dockerfile · jest.config.cjs · eslint.config.mjs · .nvmrc
│
├── web/                       ── frontend React ──
│   ├── src/
│   │   ├── main.tsx · App.tsx (rotas)
│   │   ├── pages/             Landing · Dashboard · Account · Privacy
│   │   ├── features/
│   │   │   ├── chat/          ChatPage + components/ + hooks/ + types.ts
│   │   │   └── auth/          AuthProvider · LoginModal
│   │   ├── components/        TopNav
│   │   ├── lib/               api · auth · i18n · theme · pdf · download · notify · format · clientId
│   │   └── styles/index.css
│   └── Dockerfile · nginx.conf · vite.config.ts · tailwind.config.ts
│
└── ocr-service/               ── microserviço OPCIONAL (Python) ──
    ├── app/main.py            FastAPI: GET /health · POST /ocr
    └── Dockerfile · requirements.txt · pyproject.toml
```

## Módulos

### `bot/src/core/` — o núcleo de conversa

**Papel:** toda a lógica de conversa, sem saber em que plataforma está.
**Arquivos:** `BotCore.ts` (1042 linhas — todos os handlers), `IncomingMessage.ts`
e `Replier.ts` (formato normalizado), `IMessagingAdapter.ts` (ciclo de vida),
`OutboundRegistry.ts` (push), `commands.ts` (lista única de comandos).

### `bot/src/platforms/` — os canais

Um diretório por canal, um adapter cada. Nenhum contém regra de conversa; todos
implementam `IMessagingAdapter` **e** `OutboundSender`.
`telegram/TelegramAdapter.ts` (Telegraf, long-polling) ·
`whatsapp/WhatsAppAdapter.ts` (Baileys, QR, sessão em disco, reconexão) ·
`web/WebAdapter.ts` (WebSocket, allowlist de Origin, payload máx. 8 MB).

### `bot/src/services/` — regra de negócio

19 classes. Agrupadas por assunto:

| Assunto | Serviços |
|---|---|
| Compra | `PurchaseService` · `BudgetService` · `ExportService` · `ReportService` |
| IA / OCR | `MessageProcessingService` · `GeminiProcessor` · `GptProcessor` · `OcrService` · `ocr/{Gemini,Vision,Paddle}OcrProvider` · `QrService` |
| Identidade | `UserService` · `AccountService` · `MergeService` · `LinkTokenService` · `AuthService` |
| Plano / limites | `PlanService` · `RateLimiter` |
| Background | `ReminderService` + `ReminderScheduler` · `RetentionService` + `RetentionScheduler` |
| Estoque | `ProductService` |

### `bot/src/repositories/` — dados

`UserRepository` · `PurchaseRepository` · `ProductRepository` · `ReminderRepository`.
Toda operação de usuário é filtrada por `userId` **dentro da query**.

### `web/src/features/` — front por área

Cada área guarda seus próprios `components/` e `hooks/`. `lib/` é o que atravessa
áreas (cliente HTTP, sessão, tema, i18n, formatação).

## Onde mora cada capacidade

**Registro de compra**
UI: qualquer adapter · Lógica: `BotCore.handleProcessed` + `savePurchase` ·
IA: `MessageProcessingService` · Dados: `PurchaseService`/`PurchaseRepository` ·
Modelo: `models/Purchase.ts`

**OCR de cupom / NFC-e**
Entrada: `IncomingMessage.getImageBase64` · Orquestração:
`BotCore.processReceiptImage` · OCR: `OcrService` + provider ·
QR: `QrService` · Chave: `utils/fiscalKey.ts` · Dedup: índice único parcial
`{userId, fiscalKey}` em `models/Purchase.ts`

**Autenticação e conta**
UI: `web/src/features/auth/` · HTTP: `infra/authServer.ts` ·
Sessão: `AuthService` (WorkOS + JWT) · Conta: `AccountService` ·
Fusão: `MergeService` · Deep-link: `LinkTokenService`

**Painel web**
UI: `web/src/pages/Dashboard.tsx` · Cliente: `web/src/lib/api.ts` ·
Endpoint: `GET /api/report` · Agregação: `ReportService` +
`PurchaseRepository.getMonthlyTotals`

**Lembretes (push)**
Comando: `BotCore.handleReminders` · Regra: `ReminderService` ·
Job: `ReminderScheduler` · Entrega: `OutboundRegistry` → adapter

**LGPD**
Consentimento: `AccountService.ensureWorkosUser` (grava `consentVersion`/`consentAt`) ·
Exclusão: `AccountService.deleteAccount` (chat `/excluir_conta`, web `DELETE /api/account`) ·
Retenção: `RetentionService` + `RetentionScheduler` ·
Política: `web/src/pages/Privacy.tsx`

## Diretórios especiais

**`bot/src/config/`** — `google-credentials_model.json` (versionado, é um molde
vazio) e `google-credentials.json` (**real, gitignored**, montado read-only no
compose). Ver `CONCERNS.md` — a chave precisa ser rotacionada.

**`bot/src/tests/helpers/`** — `memoryMongo.ts`, o setup do `mongodb-memory-server`
usado pelos testes de repositório.

**`bot/.husky/`** — mora no `bot/`, mas os hooks cobrem **os dois** projetos Node
(o `prepare` do bot faz `cd .. && husky bot/.husky`).

**`monitoring/`** — `prometheus.yml`, só usado com `--profile monitoring`.
