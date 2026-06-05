# Plano consolidado — Chat Web (Alfred Web)

> Frontend de chat (estilo ChatGPT/Claude) que conversa com o **mesmo `BotCore`** já usado por
> Telegram/WhatsApp. **Sem login** nesta fase — foco no chat.
> Última atualização: 05/06/2026.

## Decisões

| Tema | Escolha |
|---|---|
| Frontend | **React + Vite + Tailwind** (TypeScript), projeto novo `web/` no monorepo |
| Transporte | **WebSocket** (tempo real, com "digitando…" e reconexão) |
| Backend | **`WebAdapter` dentro do bot** (reusa o `BotCore`, mesmo processo) — habilitado por `PLATFORMS=web` |
| Identidade | **Sem login** — id anônimo persistente no `localStorage` (`externalId`); cadastro (nome/e-mail) acontece no próprio chat |
| Plataforma | adicionar `"web"` ao tipo `Platform` (o `User.identities[]` já suporta — zero migração) |

---

## Context

A Fase 1 separou **transporte** de **conversa**: o `BotCore` é agnóstico de plataforma. Um chat web é
só **mais um adapter**, então toda a lógica (onboarding, registrar compra, `/gastos`, OCR de cupom)
é reaproveitada. O frontend vira a futura **parte web** do Alfred.

```
  web/ (React+Vite+Tailwind, SPA)
        │  WebSocket (JSON)
        ▼
  bot: WebAdapter  ──►  BotCore  ──►  UserService / MessageProcessing / OCR / Purchase
   (servidor ws,         (platform: "web",
    porta WEB_PORT)       externalId = id anônimo do navegador)
```

---

## Protocolo WebSocket (JSON)

**Cliente → servidor**
```jsonc
{ "type": "user_message", "clientId": "uuid", "text": "agua 7" }
{ "type": "user_photo",   "clientId": "uuid", "imageBase64": "..." }
```

**Servidor → cliente**
```jsonc
{ "type": "bot_message", "text": "🛒 Compra registrada: …" }   // 1+ por mensagem do usuário
{ "type": "typing", "value": true | false }                    // indicador "digitando…"
{ "type": "error", "message": "…" }
```

- O `clientId` (UUID no `localStorage`) identifica o usuário → vira o `externalId` (`platform: "web"`).
- O `Replier` do web manda cada `reply.text(...)` do `BotCore` como um `bot_message` **naquele socket**.
- No connect, o frontend manda um `/start` sintético para o bot saudar (se não houver histórico).

---

## Backend — `WebAdapter` (no projeto `bot/`)

- `src/platforms/web/WebAdapter.ts` implementando `IMessagingAdapter` (start/stop).
- Lib: **`ws`** (servidor WebSocket leve) numa porta `WEB_PORT` (default `3100`).
- Por conexão/mensagem: normaliza para `IncomingMessage` (texto/foto/comando) e monta um `Replier`
  que emite `bot_message` no socket; envolve o `handle` com `typing: true/false`.
- `config.ts`: `webPort`, `webAllowedOrigin` (checagem de Origin). `PLATFORMS=web` ativa o adapter no
  orquestrador (`index.ts`).
- `Platform` (em `core/IncomingMessage.ts`): adicionar `"web"`.
- `requestPhone` no web é no-op (sem botão de contato).
- **Testes:** `WebAdapter`/handler — mensagem do cliente → coleta as respostas do `BotCore`
  (mockado) → confere os `bot_message`. (O `BotCore` já é testável.)

---

## Frontend — projeto `web/` (estrutura SOLID)

```
web/
├── index.html
├── vite.config.ts · tailwind.config.ts · tsconfig.json · package.json
└── src/
    ├── main.tsx · App.tsx
    ├── features/chat/
    │   ├── ChatPage.tsx          # container (orquestra)
    │   ├── components/
    │   │   ├── MessageList.tsx
    │   │   ├── MessageBubble.tsx
    │   │   ├── ChatInput.tsx      # texto + anexar foto, Enter envia
    │   │   └── TypingIndicator.tsx
    │   ├── hooks/
    │   │   ├── useChatSocket.ts   # transporte WS (conexão, reconexão)
    │   │   └── useChat.ts         # estado das mensagens (reducer/store)
    │   └── types.ts
    ├── lib/clientId.ts           # UUID persistente (localStorage)
    └── styles/index.css          # Tailwind
```

**Princípios:** transporte (`useChatSocket`) isolado do estado (`useChat`) e da UI (componentes
puros) — fácil trocar WS por outro transporte sem mexer na UI. Componentes pequenos e de
responsabilidade única.

**UX (estilo ChatGPT/Claude):** coluna central, bolhas usuário/bot, input fixo embaixo, botão de
anexar **foto de cupom**, indicador "digitando…", **dark/light**, responsivo, auto-scroll,
indicador de conexão. Estado mínimo (sem Redux) — `useReducer`/Zustand.

**Config:** `VITE_WS_URL` (ex.: `ws://localhost:3100`).

---

## Docker & CI

- **`web/Dockerfile`** multi-stage: build do Vite → servir estático com **nginx**.
- **`docker-compose.yml`:** serviço `web` (nginx, porta `8080:80`) + expor a porta WS do bot
  (`WEB_PORT`) na rede; o frontend aponta `VITE_WS_URL` para o bot.
- **CI:** novo workflow `web.yml` (lint + typecheck + build) com path filter `web/**`.

---

## Fases

1. ✅ **Backend WebAdapter** — `Platform "web"`, `WebAdapter` (ws, protocolo JSON, Origin allowlist,
   `maxPayload`), config `WEB_PORT`/`WEB_ALLOWED_ORIGIN`, orquestrador (`PLATFORMS=web`), comandos
   compartilhados (`core/commands.ts`), testes. Telegram/WhatsApp intactos. Identidade **T0 (anônima)**.
2. **Frontend `web/`** — scaffold Vite+React+Tailwind, `useChatSocket` + `useChat` + `clientId`, UI do chat.
3. **Integração + Docker** — serviço `web` no compose, `VITE_WS_URL`, segurança WS (Origin, limites), CI do web.
4. **Polimento** — "digitando…", upload de foto, dark/light, reconexão, estados de erro/empty.
5. **Login web (T1)** — e-mail magic-link/OTP **ou** OAuth (Google); JWT no handshake do WS;
   promoção anônimo → logado (merge do histórico).
6. **Vínculo multi-plataforma (T2 = Fase 4 do multi-plataforma)** — unificar web + telegram + whatsapp
   num único User; migração para id canônico (`Purchase.userId` = `User._id`).

---

## Segurança do WebSocket

- **Origin allowlist:** validar o header `Origin` no handshake contra `WEB_ALLOWED_ORIGIN`; rejeitar
  origens desconhecidas (defesa contra cross-site).
- **WSS/TLS em produção:** `wss://` terminado no proxy (nginx/LB). `ws://` apenas em dev local.
- **Autenticação no connect:** com login (T1), o cliente envia um **JWT** no handshake
  (query param / subprotocolo / 1ª mensagem); o server valida **antes** de aceitar. Anônimos (T0)
  entram com o `clientId`, porém com **limites menores**.
- **Validação de payload:** schema das mensagens (tipos conhecidos), **limite de tamanho** (texto e,
  principalmente, imagem em base64), descartar mensagens malformadas.
- **Rate limiting:** reusar o `RateLimiter` por `externalId`; também limitar mensagens/conexões por
  socket/IP e derrubar em abuso.
- **Heartbeat ping/pong:** detectar conexões mortas, liberar recursos, timeout de inatividade.
- **Limite de conexões** simultâneas por IP/usuário. **Sem segredos no front** — o WS só trafega o que
  o bot já enviaria.

## Identidade & login (progressivo)

> O modelo `User.identities[]` (`{ platform, externalId }`) já é o **denominador comum** entre Telegram,
> WhatsApp e Web. O web só precisa produzir um `externalId` — e, com login, um **id estável**. Web vira
> só mais um `platform` em `identities[]` (zero novidade no modelo).

**T0 — Anônimo (MVP):** `clientId` (UUID no `localStorage`) → identity `{ web, clientId }`. Zero fricção,
porém efêmero (limpar o storage = "novo usuário"). O cadastro (nome/e-mail) acontece no chat, como já é.

**T1 — Login web (recomendado):** como web não tem id nativo (≠ Telegram/WhatsApp), usar **passwordless**:
- **E-mail magic-link / OTP** — usuário informa e-mail → recebe código/link → verificado; ou
- **OAuth (Google)** — 1 clique, `externalId` = `sub` do provedor.

Gera um **accountId estável** → identity `{ web, accountId }` (o e-mail já é coletado no onboarding). O
server emite **JWT/sessão**, enviado no handshake do WS.
**Promoção anônimo → logado:** ao logar, a identity `{ web, clientId }` é **absorvida** pelo User
autenticado (merge), preservando o histórico do anônimo.

**T2 — Vínculo multi-plataforma (= Fase 4 do multi-plataforma):** do web (UI rica, lugar natural para
isso), o usuário vincula Telegram/WhatsApp por **código** (`/vincular`) ou **match por e-mail/telefone**.
Todas as identities apontam para o **mesmo User** → dados unificados. Aqui entra a **migração para id
canônico** (`Purchase.userId` = `User._id`) que adiamos na Fase 2.

**Compatibilidade:** o e-mail funciona como "cola" para sugerir o vínculo entre plataformas (mesma ideia
da sugestão por telefone no WhatsApp). Nenhuma plataforma é especial — todas são identities do User.

## Riscos & observações

- Anônimo (T0) é por-navegador; o login (T1) resolve a persistência real e habilita o vínculo (T2).
- WS é **stateful por conexão** — múltiplas instâncias exigiriam sticky session ou um broker (fora do MVP).
- O vínculo (T2) mexe em dados reais — fazer junto com a migração canônica e cobertura de testes.

## Critérios de aceite

- `PLATFORMS=telegram,web` sobe os dois; abrir o `web/` no navegador conversa com o bot.
- Fluxos do guia funcionam no chat web: cadastro → `agua 7` → foto de cupom → `/gastos`.
- Telegram/WhatsApp continuam funcionando sem alteração; suíte verde.
