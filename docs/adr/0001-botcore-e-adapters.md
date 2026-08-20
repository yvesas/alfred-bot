# ADR-0001 — Núcleo de conversa único com adapters de plataforma

**Data:** 2026-02 (registrado retroativamente em 2026-08-14)
**Status:** aceito, em vigor
**Contexto original:** "PLANO-MULTIPLATAFORMA", fase 1 — documento perdido

## Contexto

O Alfred nasceu como bot de Telegram, com a lógica de conversa escrita direto nos
handlers do Telegraf. Ao decidir suportar WhatsApp e um chat web, havia duas
saídas: duplicar os handlers por plataforma, ou extrair um núcleo comum.

Cada canal tem um SDK e um vocabulário próprios: o Telegram entrega `Context` do
Telegraf e comandos nativos; o WhatsApp entrega `WAMessage` do Baileys com o
texto em dois campos possíveis; o navegador entrega JSON por WebSocket. E cada um
suporta coisas diferentes — teclado de contato só existe no Telegram, anexo é
documento no Telegram/WhatsApp e download em base64 no web.

## Decisão

Toda a lógica de conversa vive em **uma classe** (`BotCore`), que não conhece
plataforma nenhuma. Cada canal é um **adapter** que faz duas traduções:

- **entrada:** evento do SDK → `IncomingMessage` (`platform`, `externalId`,
  `kind`, `text`/`command`/`contact`, `getImageBase64?`)
- **saída:** `Replier` (`text()`, `document?()`) → chamada do SDK

O que a plataforma não suporta o adapter **degrada em silêncio**, não rejeita:
`requestPhone` vira teclado no Telegram e nada no WhatsApp; `document` é opcional
no contrato e o `BotCore` verifica a presença antes de usar.

A lista de comandos é declarada uma vez (`core/commands.ts`) e consumida pelos
três adapters — o Telegram registra no Telegraf, os outros fazem parse do `/`.

Para mensagem **não solicitada** (lembretes), o mesmo adapter implementa
`OutboundSender` e se registra num `OutboundRegistry` singleton, que os jobs de
background consultam pela plataforma.

## Consequências

**Boas**
- WhatsApp (fase 3) e chat web foram adicionados sem tocar na regra de conversa.
- Uma correção de UX vale nos três canais no mesmo commit.
- `WebAdapter.processRaw` é testável sem socket; a mesma técnica serve para
  qualquer adapter futuro.

**Ruins**
- O `BotCore` virou um god object: **1042 linhas, 15 dependências injetadas, 25
  handlers**, com a menor cobertura do bot (58 %). O padrão está certo, a
  granularidade não — falta uma camada de handlers por comando.
- A degradação silenciosa esconde diferenças reais: quem usa GPT perde a leitura
  multimodal de cupom sem ser avisado.
- Os adapters de Telegram e WhatsApp acabaram sem teste nenhum, justamente onde
  moram os footguns de cada SDK.

**Revisitar quando:** antes de mexer na UX de conversa (frente F2 do roadmap) —
a extração dos handlers deve vir primeiro. Ver C4 em `specs/codebase/CONCERNS.md`.
