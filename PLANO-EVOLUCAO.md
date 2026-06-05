# Plano consolidado — Evolução (produto + login/vínculo)

> Bloco de features que rodam **cross-plataforma** (web + Telegram + WhatsApp) implementando a lógica
> **uma vez no `BotCore`**. Cada adapter só ajusta a apresentação. Inclui também login web (Fase 5) e
> vínculo de contas (Fase 6).
> Última atualização: 05/06/2026.

## Princípio cross-plataforma

A lógica vive no `BotCore`; os adapters traduzem entrada/saída. Para UX que precisa de "botões"
(confirmar, escolher) usamos o **baseline textual** (`sim`/`não`, números) que funciona em todas as
plataformas, e cada adapter pode **enriquecer depois** (Telegram: inline buttons; Web: quick-replies).
Isso exige uma pequena evolução do `Replier` (`withQuickReplies?`) — opcional por plataforma.

---

## Parte A — Recursos de produto (sem dependências externas)

### A1. Confirmar a compra antes de salvar ✅ CONCLUÍDA
> Implementado no `BotCore`: compra extraída + validada → guardada como **pendente** (`Map` por
> `platform:externalId`) → resumo + *"sim/não"*. `sim` salva, `não` cancela, outra msg abandona a
> pendente e segue o fluxo. Flag `CONFIRM_PURCHASE` (default on). Cross-plataforma (baseline textual).
> Testes: confirma e cancela.

**Objetivo:** após a IA extrair a compra, mostrar um resumo e pedir confirmação antes de persistir.
- **BotCore:** novo estado conversacional **"compra pendente"** por usuário (ex.: `User.pendingPurchase`
  ou cache por `externalId`). Fluxo: extrai → valida → responde *"Entendi: água — R$ 7,00. Confirmar?
  (responda **sim** ou **não**)"* → próxima msg `sim` persiste, `não` descarta.
- **Cross-plataforma:** baseline textual (sim/não); Web/Telegram podem mostrar botões depois.
- **Risco:** baixo. Toca `BotCore` + um campo no `User`.

### A2. Editar e excluir compras ✅ CONCLUÍDA
> Implementado: `/compras` numerado (1–5); `/excluir <n>` e `/editar <n> <total|descrição> <valor>`.
> `PurchaseRepository.deleteById/updateById` **escopados ao userId** (segurança); `PurchaseService`
> expõe `deletePurchase/updatePurchase`. `BotCore.nthRecentPurchase` resolve o n-ésimo da lista atual.
> `excluir`/`editar` em `KNOWN_COMMANDS` + registrados no `TelegramAdapter`. Testes: excluir e editar.

**Objetivo:** corrigir/remover lançamentos.
- **Backend:** `PurchaseService`/`Repository` ganham `deleteById` e `updateById` (por usuário).
- **Referência da compra:** `/compras` passa a numerar e mostrar um id curto; comandos
  `/excluir <n>` e `/editar <n> <campo> <valor>` (ou linguagem natural → intent "edit"/"delete").
- **BotCore:** roteia os novos comandos; confirma antes de excluir.
- **Risco:** médio (referência estável da compra; idealmente o id canônico).

### A3. Categorias personalizadas ✅ CONCLUÍDA
> Implementado: `User.categories[]`; `UserService.get/add/removeCategory`; comando `/categorias`
> (listar, `add <nome>`, `remover <nome>`). O `getPrompt001` recebe as categorias do usuário e a IA
> classifica conforme elas (vazio = lista padrão). Threading via `MessageProcessingService.resolveProcessor`
> → processadores → prompt. Testes: add (idempotente) e remove (case-insensitive).

**Objetivo:** o usuário define as próprias categorias.
- **Backend:** `User.categories: string[]`. `getPrompt001` passa a receber as categorias do usuário
  (hoje são fixas no prompt) para a IA classificar conforme elas.
- **Comando:** `/categorias` (listar/adicionar/remover) ou linguagem natural.
- **Risco:** baixo–médio. Toca `User` + prompt + `BotCore`.

### A4. Multi-idioma — 🟡 EM ANDAMENTO
> **Feito (etapa 1 — backend):** `User.language` (default `pt`) + comando `/idioma <pt|en|es>`;
> a **IA responde/categoriza no idioma do usuário** (`languageLabel` → `getPrompt001`); base de i18n
> em `src/i18n/` (`t()` + catálogo). Testes: setLanguage e `/idioma`.
> **Falta:** migrar as **strings fixas** restantes (BotCore/UserService, hoje PT) para o catálogo
> `t(lang, key)`; e o **i18n do frontend web** + seletor de idioma.

**Objetivo:** bot e UI em pt/en/es… (o prompt já aceita `lang`).
- **Backend:** `User.language`; o prompt usa `lang`; **as respostas fixas do bot** (hoje hardcoded em
  PT) vão para um **catálogo i18n** (`messages/{pt,en,es}.ts`) consultado pelo `BotCore`.
- **Frontend web:** i18n próprio (mesmo catálogo de chaves) + seletor de idioma.
- **Comando:** `/idioma <pt|en|es>`.
- **Risco:** maior (toca **todas** as strings de resposta + o front). Fazer por último.

**Ordem sugerida (valor × esforço):** A1 → A2 → A3 → A4.

---

## Parte B — Login & vínculo (web) — Fases 5 e 6

> Detalhe do desenho em [bot/PLANO-WEB-CHAT.md](./bot/PLANO-WEB-CHAT.md) (seção Identidade & login).

### B1. Login web (Fase 5) — via **WorkOS** (decidido)
- **Provedor:** **WorkOS (AuthKit)** — cobre OAuth/SSO e magic-link num só lugar (o usuário criará a
  conta). Pré-requisito: `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` e a redirect URI configurada.
- **Backend:** rota HTTP de auth no bot (callback do WorkOS) → emite **JWT** →
  o cliente envia o JWT no handshake do WS; o `WebAdapter` valida e usa o `accountId` estável como
  `externalId`. Anônimo (T0) é **absorvido** no login (merge).
- **Pré-requisito:** credenciais (OAuth client ou chave do provedor de e-mail).

### B2. Vínculo de contas (Fase 6 = multi-plataforma Fase 4)
- Do web, vincular Telegram/WhatsApp por **código** (`/vincular`) ou **match por e-mail/telefone**.
- **Aqui entra a migração para id canônico** (`Purchase.userId` = `User._id`) que adiamos — com script
  e testes, sobre dados reais.
- **Risco:** médio–alto (migração de dados).

---

## Sequenciamento recomendado

1. **A1 Confirmar compra** → 2. **A2 Editar/excluir** → 3. **A3 Categorias** → 4. **A4 Multi-idioma**
5. **B1 Login web** (quando houver OAuth/e-mail) → 6. **B2 Vínculo + migração canônica**

> Recomendo começar pela **Parte A** (sem dependências externas, valor imediato nas 3 plataformas) e
> fazer o **login (B1)** quando você decidir o mecanismo e tiver as credenciais. Cada item é uma
> entrega pequena, com testes, mantendo tudo verde.

## Critérios de aceite (por item)
- A lógica nova vive no `BotCore` e funciona em web/telegram/whatsapp.
- Telegram/WhatsApp/Web seguem funcionando; suíte verde; sem migração destrutiva sem aviso.
