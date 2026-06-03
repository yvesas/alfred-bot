# Plano — Multi-plataforma (Telegram + WhatsApp)

> Documento de planejamento. **Nada implementado ainda.** Companheiro do [ROADMAP.md](./ROADMAP.md).
> Decisões: WhatsApp via **Baileys** (grátis) primeiro; **vincular a mesma pessoa** entre
> plataformas; API oficial (Cloud API) fica para depois.
> Última atualização: 03/06/2026.

---

## Context

Hoje `src/services/TelegramBot.ts` mistura **transporte** (Telegraf: receber msg, responder, baixar
foto) com **lógica de conversa** (onboarding, registrar compra, consulta de gastos, comandos). Para
rodar também no WhatsApp, separamos as duas responsabilidades atrás de uma camada de **adapter**
(mesmo padrão Strategy já usado em OCR e IA).

```
  Telegram (Telegraf) ─▶ TelegramAdapter ─┐
                                          ├─▶ IncomingMessage + Replier ─▶ BotCore (agnóstico)
  WhatsApp (Baileys)  ─▶ WhatsAppAdapter ─┘                                  │
                                                                             ├─ UserService
                                                                             ├─ MessageProcessingService
                                                                             ├─ OcrService
                                                                             └─ PurchaseService
```

Benefício extra: com o `BotCore` separado do Telegraf, a **lógica fica testável** sem mocks de SDK.

---

## Contratos (novos)

```ts
// src/core/IncomingMessage.ts
export type Platform = "telegram" | "whatsapp";

export interface IncomingMessage {
  platform: Platform;
  externalId: string;        // id do usuário na plataforma (telegram id ou número do WhatsApp)
  kind: "text" | "photo" | "command" | "contact";
  text?: string;
  command?: { name: string; args: string[] };
  contact?: { phone: string; name?: string };
  getImageBase64?: () => Promise<string>;   // baixa a mídia sob demanda
}

// src/core/Replier.ts — como o BotCore responde (o adapter degrada o que a plataforma não suporta)
export interface Replier {
  text(message: string): Promise<void>;
  requestPhone?(message: string): Promise<void>;        // Telegram: botão de contato; WhatsApp: no-op
  withQuickReplies?(message: string, options: string[]): Promise<void>; // degrada para texto
  removeKeyboard?(): Promise<void>;
}

// src/core/IMessagingAdapter.ts
export interface IMessagingAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

`BotCore.handle(message: IncomingMessage, reply: Replier): Promise<void>` recebe a lógica que hoje
está nos handlers do `TelegramBot`. O **adapter** cria `IncomingMessage` + `Replier` a cada evento e
chama `botCore.handle(...)`.

Estrutura de pastas alvo:
```
src/
├── core/
│   ├── BotCore.ts
│   ├── IncomingMessage.ts
│   ├── Replier.ts
│   └── IMessagingAdapter.ts
├── platforms/
│   ├── telegram/TelegramAdapter.ts     # ex-TelegramBot, fininho
│   └── whatsapp/WhatsAppAdapter.ts      # Baileys
```

---

## Execução: as duas plataformas na MESMA instância

Sim — Telegram e WhatsApp rodam juntos em **um único processo Node** (um event loop). Telegraf
(long polling) e Baileys (WebSocket) são assíncronos, então o mesmo loop atende os dois
simultaneamente, sem threads. Ambos compartilham services, conexão Mongo e o `BotCore` (singletons).

**Orquestrador (em `index.ts`):** lê `PLATFORMS`, instancia os adapters habilitados, sobe todos e
**supervisiona cada um isoladamente** (um erro/queda de um não derruba o outro). O graceful shutdown
para todos.

```ts
const enabled = (process.env.PLATFORMS ?? "telegram").split(",").map((s) => s.trim());
const adapters: IMessagingAdapter[] = [];
if (enabled.includes("telegram")) adapters.push(container.get(TelegramAdapter));
if (enabled.includes("whatsapp")) adapters.push(container.get(WhatsAppAdapter));

// Sobe cada adapter de forma isolada: a falha de um não impede o outro.
await Promise.allSettled(
  adapters.map((a) =>
    a.start().catch((err) => console.error(`Adapter ${a.constructor.name} falhou ao iniciar:`, err)),
  ),
);

const shutdown = () => Promise.allSettled(adapters.map((a) => a.stop()));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

**Princípios para conviverem bem:**
- **Isolamento de falhas:** cada adapter trata suas próprias exceções/reconexões; nada de
  `unhandledRejection` derrubando o processo. O Baileys reconecta sozinho ao cair; o Telegram segue.
- **Concorrência segura:** o `BotCore` é stateless por mensagem (lê/escreve no Mongo), então
  mensagens simultâneas dos dois canais não conflitam.
- **Leveza:** Baileys é WebSocket (sem browser) — roda tranquilo ao lado do Telegraf no mesmo container.
- **Flexível depois:** como cada adapter é independente, dá para, no futuro, rodá-los em **processos
  separados** (escala/isolamento) sem mudar o `BotCore` — basta um `PLATFORMS` por instância.

## Fase 1 — Refactor: BotCore + camada de adapter (Telegram intacto) ✅ CONCLUÍDA

> Implementada: `core/{IncomingMessage,Replier,IMessagingAdapter,BotCore}`,
> `platforms/telegram/TelegramAdapter`, orquestrador por `PLATFORMS` no `index.ts`,
> `TelegramBot.ts` removido. Comportamento do Telegram inalterado; `BotCore` coberto por testes.

**Objetivo:** extrair a lógica para `BotCore` e transformar `TelegramBot` em `TelegramAdapter`, sem
mudar comportamento nem adicionar plataforma.

- Criar `core/` (interfaces acima) e `BotCore` com os métodos atuais: guard de registro, onboarding,
  `processReceiptImage`, `handleProcessedMessage`, `handleSpendingQuery`, comandos
  (`/start`, `/compras`, `/gastos`, `/ia`, `/pular`).
- `TelegramAdapter` (Telegraf): normaliza eventos → `IncomingMessage`; implementa `Replier`
  (text, requestPhone via botão de contato, removeKeyboard); registra start/stop.
- Comandos passam a ser detectados de forma agnóstica: texto iniciado por `/` → `kind: "command"`.
- `Container`/`index.ts`: introduzir o **orquestrador de adapters** (ver seção acima) já preparado
  para vários, mas com só o Telegram habilitado nesta fase (mantém singleton + graceful shutdown).

**Testes:** `BotCore` ganha testes diretos com `Replier` e services mockados (sem Telegraf).
**Risco:** baixo–médio (refactor amplo, mas sem mudança funcional). **Aceite:** Telegram igual; suíte verde.

---

## Fase 2 — Identidade multi-plataforma ✅ CONCLUÍDA (abordagem aditiva)

> Implementada de forma **aditiva, sem migração**: `User.identities[]` + `telegramId` legado mantido;
> `UserRepository.findByIdentity/updateByIdentity` (com fallback para `telegramId` no Telegram);
> `UserService`/`MessageProcessingService`/`BotCore` agora operam por `(platform, externalId)`.
> As **compras seguem por id externo** (sem reescrever dados reais) — a migração para id canônico do
> User foi **adiada para a Fase 4** (vínculo de contas), quando passa a ser necessária.

**Objetivo:** generalizar a identidade do usuário para suportar **várias plataformas por pessoa**.

**Mudança no model `User`:**
```ts
interface IIdentity { platform: Platform; externalId: string; linkedAt: Date; }
interface IUserBase {
  identities: IIdentity[];     // substitui telegramId
  name?: string; email?: string; phone?: string;
  status: UserStatus;
}
// índice único em (identities.platform, identities.externalId)
```

- `UserRepository.findByIdentity(platform, externalId)` e `addIdentity(userId, identity)`.
- **Impacto importante — `Purchase.userId`:** passa a referenciar o **id canônico do User** (Mongo
  `_id`), não mais o id do Telegram. Sem isso, contas vinculadas não compartilhariam os gastos.
- **Migração:** usuários atuais → `identities: [{ platform: "telegram", externalId: <telegramId> }]`;
  `purchases.userId` (string telegram) → `_id` do User correspondente (script de migração).

**Risco:** médio (toca model + dados existentes). **Aceite:** Telegram continua funcionando após a migração; gastos seguem corretos.

---

## Fase 3 — WhatsAppAdapter (Baileys) ✅ CONCLUÍDA

> Implementado: `platforms/whatsapp/WhatsAppAdapter` (Baileys 6.x, login por QR, reconexão,
> sessão em `WHATSAPP_SESSION_DIR` — gitignorada e em volume no compose). Normaliza texto/foto/comandos
> para `IncomingMessage`; telefone preenchido automaticamente (o `externalId` do WhatsApp é o número).
> Habilitado por `PLATFORMS=telegram,whatsapp`. `tsconfig` com `skipLibCheck` (deps do Baileys).

**Objetivo:** segundo adapter usando a lib gratuita **Baileys** (sem chaves, login por QR).

- Deps: `@whiskeysockets/baileys`, `qrcode-terminal` (mostrar QR), `pino` (logger).
- Sessão persistida em disco (`useMultiFileAuthState`) — em Docker, **montar volume** (a sessão não
  pode se perder, senão re-scaneia o QR).
- Conexão: tratar `connection.update` (QR no 1º start, reconexão automática em quedas).
- Receber: `sock.ev.on("messages.upsert")` → extrair texto/imagem e o remetente
  (`jid` tipo `5511...@s.whatsapp.net` → `externalId` = número).
- Responder: `sock.sendMessage(jid, { text })`. Mídia: `downloadMediaMessage` → base64 para o OCR.
- **UI degradada:** WhatsApp (Baileys) não tem teclado/botão de contato → `requestPhone` vira no-op.
  Mas no WhatsApp **já temos o número** do usuário, então o onboarding pula a etapa do telefone
  (preenche `phone` automaticamente) e pode pedir só nome/e-mail.
- Seleção por env: `PLATFORMS=telegram,whatsapp` (ambos no mesmo processo; cada adapter no seu socket).

**Riscos (registrar no ROADMAP):**
- **Não-oficial:** contra os ToS do WhatsApp; o número pode ser **banido**. Usar um número dedicado.
- **Frágil:** quebra quando o WhatsApp muda o protocolo; manter a lib atualizada.
- **Sessão/estado:** exige persistência (volume) e tratamento de reconexão.

**Aceite:** com `PLATFORMS=telegram,whatsapp`, enviar "agua 7" e foto de cupom pelo WhatsApp registra a compra; `/gastos` responde.

---

## Fase 4 — Vínculo de contas (mesma pessoa em 2 apps)

**Objetivo:** permitir que a mesma pessoa use Telegram e WhatsApp compartilhando os dados.

- **Comando `/vincular`:** na plataforma A gera um **código curto** (TTL ~10 min) guardado no User;
  o bot instrui: "envie `/vincular <código>` no outro app".
- **`/vincular <código>`** na plataforma B: encontra o User pendente pelo código e **adiciona a
  identidade** desta plataforma a ele; se a plataforma B já tinha um User novo, faz o **merge**
  (mover compras para o User canônico) e remove o duplicado.
- **Sugestão automática por telefone:** quando um número novo fala no WhatsApp, se já existir um User
  com aquele `phone` (compartilhado no onboarding do Telegram), o bot oferece vincular:
  *"Vi um cadastro como {nome} no Telegram com esse número — quer vincular?"*.
- Edge cases a tratar: merge de compras, conflito de e-mail/nome, código expirado/ inválido.

**Risco:** médio–alto (merge de dados). **Aceite:** vincular as duas identidades faz `/compras` e `/gastos` mostrarem o histórico unificado.

---

## Fase 5 — (Futuro) API oficial (WhatsApp Cloud API)

Quando for comercializar: adapter da **Cloud API** (oficial). Exige conta Meta Business, número,
token, **webhook HTTPS público** (servidor HTTP no app), verificação e *templates* para mensagens
proativas (fora da janela de 24h). Entra como mais um `IMessagingAdapter`, **sem tocar no BotCore** —
e pode rodar em paralelo ao Baileys durante a transição.

---

## Variáveis de ambiente (a adicionar)

```dotenv
# Plataformas ativas (separadas por vírgula): telegram | whatsapp
PLATFORMS=telegram

# Baileys (WhatsApp não-oficial) — diretório da sessão (montar volume no Docker)
WHATSAPP_SESSION_DIR=./.wa-session
```

---

## Ordem, riscos e princípios

| Fase | Entrega | Risco |
|---|---|---|
| 1 | BotCore + adapter (Telegram intacto) | Baixo–médio |
| 2 | Identidade multi-plataforma + migração | Médio |
| 3 | WhatsAppAdapter (Baileys) | Médio (ToS/ban, fragilidade) |
| 4 | Vínculo de contas | Médio–alto (merge de dados) |
| 5 | API oficial (Cloud API) | Infra (webhook) |

**Princípios:**
- Cada fase mantém o Telegram funcionando.
- `BotCore` não conhece plataforma; tudo específico fica nos adapters.
- Baileys é para estudo/MVP; a API oficial é o caminho para produção/comercialização.
- Cobrir o `BotCore` com testes (grande ganho do refactor).
