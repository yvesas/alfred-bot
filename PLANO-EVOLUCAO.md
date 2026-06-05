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

### A4. Multi-idioma — ✅ CONCLUÍDA
> **Etapa 1 (backend IA):** `User.language` (default `pt`) + `/idioma <pt|en|es>`; a **IA
> responde/categoriza no idioma do usuário** (`languageLabel` → `getPrompt001`).
> **Etapa 2 (strings fixas):** catálogo i18n completo em `src/i18n/` — `t(lang, key, params?)` com
> interpolação `{x}` e tipo `Record<Language, Record<Key,…>>` (o TS exige todas as chaves em pt/en/es).
> Migradas **todas** as respostas fixas de `BotCore`, `UserService`, `BudgetService` e
> `MessageProcessingService`; o `lang` é resolvido por mensagem e threadado nos handlers. Lembretes
> guardam o idioma (`Reminder.language`) para localizar o **push**.
> **Etapa 3 (frontend web):** `web/src/lib/i18n.tsx` (provider + `useI18n`, detecção pelo navegador,
> persistência) + **seletor de idioma** no header; ao trocar, o front envia `/idioma` ao bot para
> alinhar as respostas. Testes: bot 78 verdes; web i18n + notify.
> **Observação:** as razões de validação em `purchaseConverter` (técnicas, raramente exibidas)
> seguem em PT — fora do escopo BotCore/UserService.

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

### B1. Login web (Fase 5) — via **WorkOS** — ✅ IMPLEMENTADO (gated por config)
> Sem `WORKOS_*` + `JWT_SECRET` completos, o login fica **desligado** e o chat web segue anônimo
> (nada quebra). `isAuthEnabled()` controla o boot do `AuthServer`.

**Implementação**
- **`AuthService`** (`services/AuthService.ts`): WorkOS AuthKit (`getAuthorizationUrl`,
  `authenticateWithCode`) + emissão/validação de **JWT** de sessão (`jsonwebtoken`).
- **`AuthServer`** (`infra/authServer.ts`, porta `AUTH_PORT=3001`):
  - `GET /auth/login?clientId=<anon>` → redireciona ao AuthKit (o `state` carrega o clientId anônimo).
  - `GET /auth/callback?code=&state=` → troca o code, **garante a conta** (`AccountService`),
    **absorve o anônimo**, emite o JWT e redireciona para `WEB_APP_URL?token=<jwt>`.
- **`AccountService`**: `ensureWorkosUser` (perfil do WorkOS → nome/e-mail + `status=complete`,
  **pulando o onboarding**); `absorbAnonymous` (reatribui compras/lembretes do clientId anônimo,
  funde categorias/orçamentos e remove o doc anônimo). Repos ganharam `reassignUser`,
  `reassignExternalId`, `deleteByIdentity`.
- **`WebAdapter`**: aceita `token` no payload; com JWT válido, a identidade canônica passa a ser o
  `sub` (id do WorkOS) em vez do clientId anônimo. Push (lembretes) passa a chegar na conta logada.
- **Frontend**: `lib/auth.ts` (login redirect, captura de `?token=`, decode da sessão), botão
  **Entrar/Sair** no header, token anexado a toda mensagem do WS.
- **Testes**: `AuthService` (JWT roundtrip/inválido/sem segredo), `AccountService` (ensure + merge),
  `auth state` (encode/decode), `decodeSession` (web). Bot 87 testes; web 12.

**Configurar no WorkOS (passo a passo da redirect URI)**
1. Dashboard WorkOS → **Authentication** → habilite **AuthKit** (e os métodos: Google, e-mail, etc.).
2. **Redirects** → em **Redirect URIs** adicione a URL EXATA do callback do bot:
   - Dev: `http://localhost:3001/auth/callback`
   - Prod: `https://SEU_DOMINIO_DO_BOT/auth/callback`
3. Copie **Client ID** e **API Key** (já no `.env`) e preencha no `.env` do bot:
   `WORKOS_REDIRECT_URI` (igual ao passo 2), `WEB_APP_URL` (origem do front, ex.: `http://localhost:8081`)
   e `JWT_SECRET` (string longa aleatória).
4. No front, `VITE_AUTH_URL` aponta para o AuthServer (`http://localhost:3001` em dev).

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
