# Arquitetura — como o Alfred é hoje

**Atualizado:** 2026-08-14

Visão estável do sistema. O mapeamento detalhado (padrões, fluxos passo a passo,
fronteiras de módulo) está em
[`specs/codebase/ARCHITECTURE.md`](../specs/codebase/ARCHITECTURE.md).

## Em uma frase

**Um processo Node** hospeda três canais de conversa, dois servidores HTTP e dois
jobs de background, todos falando com um núcleo de conversa único e um MongoDB.

## Componentes

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Telegram   │  │  WhatsApp   │  │  Navegador  │
│  (Telegraf) │  │  (Baileys)  │  │   (React)   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │ polling        │ socket         │ WS :3100 · HTTP :3001
       └────────────────┴────────────────┘
                        │
        ┌───────────────▼───────────────┐
        │      processo do bot          │
        │  ┌─────────────────────────┐  │
        │  │        BotCore          │  │  regra de conversa
        │  └───────────┬─────────────┘  │
        │   services · repositories     │
        │  ┌─────────────────────────┐  │
        │  │ AuthServer      :3001   │  │  login OTP + API do painel
        │  │ HealthServer    :3000   │  │  /health /ready /metrics
        │  │ ReminderScheduler  60s  │  │
        │  │ RetentionScheduler 24h  │  │
        │  └─────────────────────────┘  │
        └───────┬───────────────┬───────┘
                │               │
         ┌──────▼──────┐  ┌─────▼──────────────────────┐
         │  MongoDB    │  │ Vertex AI (Gemini) · OpenAI │
         │ (Atlas/     │  │ Cloud Vision · WorkOS       │
         │  container) │  │ ocr-service (opcional)      │
         └─────────────┘  └────────────────────────────┘
```

Um processo, três portas, quatro coleções. Não há fila, broker nem cache — o
estado transitório vive na memória do processo (ver *Limites*).

## Portas

| Porta | Servidor | Serve |
|---|---|---|
| 3000 | `infra/health.ts` | `/health` (liveness) · `/ready` (readiness + Mongo) · `/metrics` (Prometheus) |
| 3001 | `infra/authServer.ts` | login por e-mail+OTP, deep-links de vínculo, `/api/*` do painel |
| 3100 | `platforms/web/WebAdapter.ts` | WebSocket do chat web |
| 8000 | `ocr-service/` (opcional) | `POST /ocr` — só com `OCR_PROVIDER=paddle` |

Telegram e WhatsApp **não abrem porta**: um faz long-polling, o outro mantém um
socket de saída.

## Camadas

```
adapter de plataforma        traduz SDK ↔ IncomingMessage/Replier
        ↓
BotCore                      toda a regra de conversa, agnóstico de canal
        ↓
services                     regra de negócio (compra, plano, identidade, IA)
        ↓
repositories                 queries e agregações; escopo por usuário na query
        ↓
models (Mongoose)            schemas e índices
```

Regras que valem: nenhum adapter importa repository ou model; nenhum service
importa adapter; `process.env` é lido só em `infra/config.ts`.

## Modelo de dados

Quatro coleções.

**`User`** — a identidade. `identities[]` guarda pares `(platform, externalId)`,
com índice único esparso; `verifiedEmail`/`verifiedPhone` são as chaves de fusão
automática de contas. Carrega também as preferências (`language`, `aiModel`,
`categories[]`, `budgets[]`), o plano e o consentimento LGPD
(`consentVersion`, `consentAt`). O campo `telegramId` é legado.

**`Purchase`** — `userId` guarda o `String(User._id)`. `items[]` embutidos com
categoria por item (é daí que sai a quebra por categoria). Índice único
**parcial** `{userId, fiscalKey}` — é o que impede registrar o mesmo cupom duas
vezes. `date` é a data do cupom; **os relatórios agregam por `createdAt`** (data
de lançamento).

**`Reminder`** — ainda chaveado por `(platform, externalId)`, não por `_id`,
porque o push precisa saber para onde enviar.

**`Product`** — estoque/despensa, por `userId`.

## Decisões estruturais

| ADR | Decisão |
|---|---|
| [0001](adr/0001-botcore-e-adapters.md) | Núcleo de conversa único com adapters de plataforma |
| [0002](adr/0002-identidade-canonica.md) | Identidade canônica pelo `User._id` |
| [0003](adr/0003-ia-e-ocr-atras-de-interface.md) | IA e OCR atrás de interface, escolhidos por ambiente |

Decisões menores: [`decisions.md`](decisions.md).

## Configuração

Tudo em `bot/src/infra/config.ts`. `DATABASE_URL` e `TELEGRAM_TOKEN` são
obrigatórias e validadas no startup (`assertRequiredConfig` — falha com a lista
do que falta). O resto tem default ou é validado no uso.

Chaves que mudam o comportamento do sistema:

| Variável | Default | Efeito |
|---|---|---|
| `PLATFORMS` | `telegram` | quais adapters sobem (`telegram,whatsapp,web`) |
| `OCR_PROVIDER` | `gemini` | `gemini` · `vision` · `paddle` |
| `OCR_MODE` | `ocr` | `multimodal` pula o OCR e manda a imagem ao modelo |
| `CONFIRM_PURCHASE` | `true` | pede "sim/não" antes de salvar |
| `REMINDERS_ENABLED` | `true` | liga o scheduler de lembretes |
| `RETENTION_ENABLED` | `false` | liga a purga de sessões anônimas (LGPD) |
| `WORKOS_*` + `JWT_SECRET` | vazio | os três juntos ligam o login web |

## Ciclo de vida

**Subida** (`bot/src/index.ts`): valida config → sobe o health server (o
liveness já responde durante a inicialização) → conecta o Mongo (falha aqui
aborta com `exit 1`) → sobe os adapters de `PLATFORMS` com `Promise.allSettled`
(a falha de um canal não derruba os outros) → sobe os schedulers e o AuthServer →
`setAppReady(true)`.

**Descida:** `SIGINT`/`SIGTERM` → `setAppReady(false)` (o `/ready` passa a
responder 503 e o orquestrador tira do balanceador) → para schedulers e
AuthServer → para os adapters → fecha o health server.

## Limites conhecidos

O sistema hoje **roda em uma instância só**. Duas coisas impedem escalar
horizontalmente:

1. **Estado em memória** — compras aguardando confirmação, e-mails aguardando
   código, tokens de vínculo (TTL 10 min) e a janela do rate limit. Um reinício
   perde tudo; uma segunda réplica não enxerga o estado da primeira.
2. **Schedulers sem lock** — `setInterval` em cada processo. Com N réplicas, o
   usuário recebe N vezes o mesmo lembrete, e a purga de retenção (que **apaga
   contas**) roda concorrente.

Ambos estão catalogados como C2 e C3 em
[`specs/codebase/CONCERNS.md`](../specs/codebase/CONCERNS.md), com caminho de
correção. Resolver antes de qualquer deploy com réplica.
