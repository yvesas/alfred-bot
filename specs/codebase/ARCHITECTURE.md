# Arquitetura

**Analisado:** 2026-08-14
**Padrão:** monolito modular em camadas, com **núcleo de conversa único** e
**adapters de plataforma** intercambiáveis. Um só processo Node hospeda os três
canais, três servidores HTTP/WS e dois jobs de background.

## Estrutura de alto nível

```
      Telegram          WhatsApp            Navegador
     (Telegraf)         (Baileys)          (React/Vite)
          │                 │                    │ WebSocket :3100
   TelegramAdapter   WhatsAppAdapter         WebAdapter
          └────────────────┬────────────────────┘
                  IncomingMessage + Replier
                           │
                    ┌──────▼──────┐
                    │   BotCore   │  toda a lógica de conversa
                    └──────┬──────┘
        ┌──────────────────┼──────────────────┐
     Services          Converters          i18n (pt/en/es)
        │
   Repositories ──► Mongoose models ──► MongoDB

  Fora do fluxo de conversa:
   AuthServer :3001 (HTTP) ─ login OTP + API do painel  ──► mesmos Services
   HealthServer :3000 (HTTP) ─ /health /ready /metrics
   ReminderScheduler · RetentionScheduler (setInterval) ──► OutboundRegistry
```

Bootstrap em `bot/src/index.ts`: valida a config → sobe o health server → conecta
o Mongo → resolve os adapters de `PLATFORMS` e sobe cada um **isoladamente**
(`Promise.allSettled` — a falha de um canal não derruba os outros) → sobe os
schedulers e o AuthServer → marca `setAppReady(true)` → registra `SIGINT`/`SIGTERM`.

## Padrões identificados

### 1. Adapter de plataforma (`IMessagingAdapter`)

**Onde:** `bot/src/core/` (contratos) e `bot/src/platforms/*/` (implementações)
**Objetivo:** a lógica de conversa não conhece Telegram, WhatsApp nem WebSocket.
**Como:** cada adapter traduz eventos do seu SDK para `IncomingMessage`
(`platform`, `externalId`, `kind`, `text`/`command`/`contact`/`getImageBase64`) e
monta um `Replier` (`text()`, `document?()`). O `BotCore` recebe os dois e responde.
**Degradação graciosa:** o que a plataforma não suporta é ignorado pelo adapter —
`requestPhone` vira teclado de contato no Telegram e nada no WhatsApp; `document`
é anexo no Telegram/WhatsApp e um evento `download` (base64) no web.
**Exemplo:** `TelegramAdapter.replier()` · `WebAdapter.processRaw()`
**Detalhe:** os comandos são declarados uma vez em `core/commands.ts`
(`KNOWN_COMMANDS`); o Telegram os registra nativamente no Telegraf, WhatsApp e Web
fazem o parse do prefixo `/`.

### 2. Injeção de dependência por container (Inversify)

**Onde:** `bot/src/infra/Container.ts`
**Objetivo:** clients caros (Vertex AI, OpenAI, Vision) são criados **uma vez**, não
por mensagem; e o provider de OCR é trocável por variável de ambiente.
**Como:** binds `toSelf()` para quase tudo; `inSingletonScope()` onde o estado
precisa ser compartilhado — `OutboundRegistry`, `LinkTokenService`, `RateLimiter`,
`BotCore`, os três adapters, `AuthService`, `AuthServer`, os schedulers.
**Factory:** `resolveOcrProvider()` escolhe `Vision|Gemini|Paddle` por
`OCR_PROVIDER` e faz o bind no token `OCR_PROVIDER_TOKEN`.

### 3. Provider atrás de interface (OCR e IA)

**Onde:** `services/ocr/IOcrProvider.ts` + `OcrService` (fachada) ·
`IMessageProcessor` em `services/MessageProcessingService.ts`
**Objetivo:** trocar fornecedor sem tocar no domínio.
**IA:** `GeminiProcessor` e `GptProcessor` implementam o mesmo contrato; o
`MessageProcessingService` escolhe pelo `User.aiModel` e, **no `catch`, tenta o
modelo alternativo** (gemini↔gpt) antes de desistir (B7).
**Multimodal:** `processImage?()` é opcional no contrato — só o Gemini implementa;
quando ausente, o chamador cai no caminho `OCR → texto → extração`.

### 4. Normalização na borda (converters)

**Onde:** `bot/src/infra/converters/`
**Objetivo:** o JSON da IA nunca entra cru no domínio.
`validateAndConvertModelResponse` faz o parse (limpando cercas ```json), exige
`intent`, e só valida campos de compra quando `intent === "purchase"`.
`convertModelResponseToPurchase` monta o `IPurchaseCreate`, aceita a `accessKey`
apenas com DV mód-11 válido e deriva o CNPJ da loja da própria chave.
`validatePurchaseData` rejeita valores implausíveis **antes** de persistir.

### 5. Repository sobre Mongoose

**Onde:** `bot/src/repositories/`
**Objetivo:** os services não montam query. Toda operação de escopo do usuário é
filtrada por `userId` **na própria query** (`findOneAndDelete({ _id, userId })`) —
o isolamento entre usuários é do repositório, não do handler.
**Agregações:** `getSpendingSummary` usa um `$facet` único (totais + por loja +
por categoria), com `$unwind` dos itens e rótulo default para categoria vazia.

### 6. Push / mensagem não-solicitada (`OutboundRegistry`)

**Onde:** `bot/src/core/OutboundRegistry.ts`
**Objetivo:** um job de background precisa falar com o usuário sem ele ter escrito.
**Como:** cada adapter implementa `OutboundSender.sendTo()` e se registra no
`start()`; o `ReminderScheduler` resolve o sender pela `platform` do lembrete.
Nunca lança — devolve `false` quando não há sender ou o usuário está offline (o
web só entrega com aba aberta).

### 7. i18n por catálogo tipado

**Onde:** `bot/src/i18n/index.ts` (bot) e `web/src/lib/i18n.tsx` (front)
**Como:** `Record<Language, Record<MessageKey, ...>>` — o TypeScript **exige** as
três traduções (pt/en/es) de cada chave. Falta de tradução é erro de compilação.
O idioma da resposta da IA vai no prompt; as strings fixas saem do catálogo.

## Fluxos principais

### Registrar compra por texto

```
adapter → BotCore.handleText
  ├─ RateLimiter.allow(externalId)            → bloqueia se estourou
  ├─ UserService.findByIdentity               → sem usuário? ensureUser (onboarding)
  ├─ status != complete?                      → submitAnswer (nome/e-mail) e sai
  ├─ resolvePendingConfirmation               → "sim"/"não" de uma compra pendente
  └─ MessageProcessingService.processMessage  → Gemini/GPT (fallback cruzado)
        └─ BotCore.handleProcessed
             ├─ intent "query"  → handleSpendingQuery
             ├─ intent != purchase → devolve a mensagem da IA
             └─ intent "purchase"
                  ├─ dedup por fiscalKey       (cupom já registrado?)
                  ├─ PlanService.canRegister   (limite do free)
                  ├─ validatePurchaseData
                  ├─ CONFIRM_PURCHASE? → guarda em pendingPurchases e pergunta
                  └─ savePurchase → PurchaseService → BudgetService.alertsForPurchase
```

### Registrar compra por foto de cupom

```
adapter.getImageBase64() → BotCore.handlePhoto → processReceiptImage
  ├─ OCR_MODE=multimodal → MessageProcessingService.processImage (1 chamada)
  │     └─ null (modelo sem suporte) → OcrService.extractTextFromImage → processMessage
  └─ enrichFiscalKey: chave lida pela IA → se inválida, QrService.decode(jsQR)
        → só aceita com DV mód-11 correto
  → handleProcessed (mesmo caminho acima)
```

### Login web e identidade canônica

```
LoginModal → POST /auth/email/start   → WorkOS Magic Auth envia o código
           → POST /auth/email/verify  → AuthService.authenticateEmail
                ├─ AccountService.ensureWorkosUser  (cria/atualiza; grava consentimento LGPD)
                ├─ AccountService.absorbAnonymous   (migra a sessão anônima do clientId)
                └─ AuthService.issueJwt → JWT (30 d) → o front guarda e manda no WS e no Bearer
```

### Vínculo cross-plataforma (Fase 6)

Três caminhos convergem no `MergeService`:

1. **Deep-link** — `LinkTokenService.issue()` (token de 12 chars, TTL 10 min, memória)
   → `t.me/<bot>?start=<token>` ou `wa.me/<num>?text=/vincular <token>` →
   `BotCore.tryLink` → `consume()` → `MergeService.linkAccounts`
2. **E-mail verificado** — `/email` + `/codigo` no chat, ou o login web →
   `linkVerifiedEmail` → procura o "gêmeo" por `verifiedEmail` → funde
3. **Telefone verificado** — automático no WhatsApp (o `externalId` **é** o número)
   ou "compartilhar contato" no Telegram → `linkVerifiedPhone`

`mergeUsers` reatribui as compras por `_id`, une identidades/categorias/orçamentos
e apaga o documento secundário. A conta com identidade **web** é preferida como
primária.

## Organização do código

**Abordagem:** por camada no bot, por feature no front.

**`bot/src/`** — `core/` (contratos + BotCore) · `platforms/<canal>/` ·
`services/` (regra de negócio) · `repositories/` (acesso a dados) · `models/`
(schemas Mongoose) · `infra/` (config, DI, logger, métricas, health, HTTP,
converters) · `i18n/` · `IA/` (prompts) · `utils/` · `scripts/` · `tests/`

**`web/src/`** — `pages/` (rotas) · `features/<área>/` (chat, auth, cada uma com
seus `components/` e `hooks/`) · `components/` (compartilhados) · `lib/`
(api, auth, i18n, theme, pdf, download, notify, format) · `styles/`

**Fronteiras de módulo (respeitadas hoje):**

- adapter → `BotCore` → services → repositories → models. Nenhum adapter importa
  repository ou model; nenhum service importa adapter.
- `OutboundRegistry` é a única via de saída fora do `Replier`.
- `config` é lido num lugar só (`infra/config.ts`) e validado no startup
  (`assertRequiredConfig`).
