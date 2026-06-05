# Plano — Fase 6: identidade canônica + vínculo de contas (cross-plataforma)

> Objetivo: unir Telegram + WhatsApp + Web numa **única conta** por pessoa, com os gastos
> somando num lugar só. Como **não há prod nem usuários**, fazemos a **migração canônica completa**
> (`Purchase.userId = User._id`) sem risco de dados reais.
> Decisões travadas: **e-mail é a chave** (verificado via WorkOS Magic Auth, no web e no chat);
> **telefone auto-vincula** onde já é confiável (WhatsApp sempre; Telegram se compartilhar contato);
> **vínculo cross-plataforma por deep-link** (sem SMS, sem cold-message, sem depender de contato prévio).
> Última atualização: 05/06/2026.

## Por que NÃO usamos código por SMS/telefone

- **Telegram:** um bot **não pode iniciar conversa** nem mandar nada para quem nunca deu Start nele
  (limite duro da plataforma). Enviar código para um número "frio" é **impossível**.
- **WhatsApp (Baileys, não-oficial):** mandar mensagem para quem nunca escreveu é a forma mais rápida
  de a conta ser **banida**. O caminho limpo seria a WhatsApp Business API oficial (paga).
- **Quase nunca é preciso:** quem está falando com o bot já teve a identidade verificada de graça
  (WhatsApp = número real; Telegram = "compartilhar contato"). O caso "código para um número com quem
  não converso" é exatamente o impossível/arriscado → resolvemos com **deep-link** (abaixo).

---

## Visão geral em uma frase

Hoje cada plataforma é uma "ilha" (`Purchase.userId` = `externalId` da plataforma). A Fase 6 passa a
chavear tudo por **`User._id`** e introduz **identificadores verificados** (e-mail/telefone) que
**fundem** automaticamente contas da mesma pessoa.

---

## Parte 1 — Migração para identidade canônica (`Purchase.userId = User._id`) — ✅ CONCLUÍDA
> Feito: `MessageProcessingService` resolve `User._id` (`resolveProcessor`) e o injeta em
> `response.userId`; `BotCore` threada o `userId` canônico em compras/gastos/orçamento;
> `BudgetService` usa `purchase.userId`; `AccountService.absorbAnonymous` reatribui por `_id`.
> Script `src/scripts/migrateCanonical.ts` (`--apply`/dry-run) + `pnpm migrate:canonical`.
> Lembretes seguem por `(platform, externalId)` (alvo do push) — `userId` entra no merge (Parte 2/3).
> 87 testes verdes.

### Por que
Para "somar" gastos de várias plataformas numa conta só, a chave de propriedade precisa ser o
**usuário** (`User._id`), não o `externalId` de uma plataforma.

### Mudanças de modelo
- **`Purchase.userId`**: passa a guardar `String(User._id)` (hoje guarda o `externalId`).
- **`Reminder`**: ganha `userId = String(User._id)` (propriedade/listagem). Mantém `platform` +
  `externalId` **apenas como alvo de entrega do push** (precisamos saber por onde alcançar o usuário).
- **`User`**: ganha `verifiedEmail?` e `verifiedPhone?` (índices `sparse`, usados no auto-vínculo).

### Mudanças de código (resolver o canônico na entrada)
A lógica fica simples porque o `BotCore` **já tem o `IUser`** após `findByIdentity`/`requireRegistered`.
Em vez de passar `externalId` como `userId`, passamos `String(user._id)`:
- `MessageProcessingService.processMessage`: `response.userId = String(user._id)` (hoje = externalId).
- `BotCore`: threada `userId = String(user._id)` em compras, gastos, orçamento, lembretes.
- `PurchaseService`/`PurchaseRepository`, `BudgetService`, `ReminderService`: nenhuma mudança de
  assinatura — só passam a receber o `_id` canônico em vez do `externalId`.

### Script de migração (`scripts/migrate-canonical.ts`)
- Para cada `Purchase`, acha o `User` por `findByIdentity('?', userId)` (varrendo as plataformas) e
  reescreve `userId = User._id`. Idem para `Reminder`.
- **`--dry-run` por padrão**: só imprime contagens/amostras/órfãos (compras sem usuário). O run real
  exige `--apply` explícito.
- Como **não há dados hoje**, o script roda como no-op; fica pronto para qualquer ambiente futuro.

### Compatibilidade / risco
- Sem prod e sem usuários → **sem migração destrutiva real**. O índice legado `telegramId` e o
  `identities[]` continuam; só muda a chave das compras/lembretes.

---

## Parte 2 — Identificadores verificados + vínculo automático

### Conceito
Cada `User` acumula **identificadores verificados**:
- `verifiedEmail` — verificado pelo **WorkOS Magic Auth** (web e chat) ou pelo login WorkOS.
- `verifiedPhone` — confiável **nativamente**: WhatsApp (sempre) e Telegram (se compartilhar contato).

**Vincular = ganhar um identificador verificado que já pertence a outra conta** → as duas contas
**fundem** numa só (`MergeService`).

### De onde vem cada identificador (resumo)
| Plataforma | E-mail | Telefone |
|---|---|---|
| **Web (WorkOS)** | ✅ verificado no login (AuthKit) | — (não verificamos telefone no web; sem SMS) |
| **Telegram** | via Magic Auth (código no chat) | só se tocar "compartilhar contato" |
| **WhatsApp** | via Magic Auth (código no chat) | ✅ verificado pela própria plataforma |

→ **E-mail é o denominador comum** (funciona nas 3); **telefone é bônus** onde já é confiável.

### Fluxo de verificação de e-mail no chat (WorkOS Magic Auth, headless)
1. Usuário (Telegram/WhatsApp) manda `/email maria@exemplo.com` (ou no onboarding).
2. Bot chama `workos.userManagement.createMagicAuth({ email })` → WorkOS envia o código.
3. Bot: "enviei um código para maria@…; responda `/codigo 123456`". Estado `awaiting_email_code`
   (mapa em memória, como o `pendingPurchases`).
4. Usuário responde `/codigo 123456` → `authenticateWithMagicAuth({ clientId, email, code })`.
5. Sucesso → grava `verifiedEmail` → dispara **auto-merge** (procura outra conta com o mesmo e-mail).

### Auto-vínculo por telefone (sem código)
- **WhatsApp:** no primeiro contato já temos o número → grava `verifiedPhone` → auto-merge se outra
  conta tiver o mesmo telefone.
- **Telegram:** quando o usuário toca **"compartilhar telefone"** (botão que já existe no onboarding),
  o número vem verificado → mesmo tratamento.

### `MergeService` (generaliza o `AccountService`)
`mergeUsers(primary, secondary)`:
- Reatribui `Purchase.userId` e `Reminder.userId` de `secondary._id` → `primary._id`.
- Une `identities[]`, `verifiedEmail/Phone`, categorias, orçamentos; em conflito de preferências
  (nome, idioma, modelo de IA) **vence a conta com login web (WorkOS)**, senão a mais antiga.
- Remove o doc `secondary`.
- Reaproveita os `reassign*` já criados na Fase 5 (agora por `_id`, não por `externalId`).

### Vínculo cross-plataforma por **deep-link** (mecanismo principal, sem SMS)
Inverte o fluxo: em vez de o bot ir atrás do usuário, **o usuário inicia o contato carregando um
token** — funciona mesmo se nunca falou com o bot, sem cold-message e sem risco de ban.

- No web (logado), botões **"Vincular Telegram"** e **"Vincular WhatsApp"** geram um `linkToken`
  curto (TTL ~10 min) associado ao `User._id` canônico.
- **Telegram:** abre `https://t.me/<bot>?start=<linkToken>` → usuário aperta **Start** → o bot recebe
  o token no payload do `/start` (`ctx.startPayload`) → funde a identidade Telegram na conta do token.
- **WhatsApp:** abre `https://wa.me/<numero>?text=/vincular%20<linkToken>` → mensagem já preenchida →
  usuário **envia** → o bot lê o token em `/vincular` → funde.
- Em ambos, quem inicia é o usuário (cria o contato no ato) e o token prova ser a mesma pessoa do web.

> Sentido inverso (começou no celular, quer entrar no web): a ponte é o **e-mail via Magic Auth**.

### Tabela de vínculo (sem SMS)
| Cenário | Como vincula |
|---|---|
| Mesma plataforma em uso | Identidade já verificada (WhatsApp nº; Telegram share-contact) — nada a fazer |
| Web → Telegram | deep-link `t.me/<bot>?start=<token>` (aperta Start) |
| Web → WhatsApp | `wa.me/<num>?text=/vincular <token>` (envia) |
| Telegram/WhatsApp → Web | e-mail (Magic Auth: `/email` + `/codigo`) |

---

## Jornadas do usuário (as suas duas, cobertas)

1. **Começa no Web** → AuthKit verifica o e-mail. Para trazer o celular: no Telegram/WhatsApp, o bot
   verifica o **mesmo e-mail** via Magic Auth (código no chat) → funde. No WhatsApp, se o telefone já
   bater com algo, funde sem nem pedir e-mail.
2. **Começa no Telegram/WhatsApp** → bot pede e-mail → Magic Auth manda código → usuário digita no
   chat → e-mail verificado → funde com a conta web do mesmo e-mail. (No WhatsApp, o telefone já
   entra como identificador verificado de bônus.)

> Resolve o "Telegram não tem telefone": o **e-mail** é a ponte; o telefone entra automático só onde
> existe (WhatsApp / Telegram com contato compartilhado).

---

## Entregáveis (ordem sugerida)

1. **Migração canônica** (Parte 1): modelos + threading `User._id` + `scripts/migrate-canonical.ts`
   (`--dry-run`/`--apply`) + testes. Mantém tudo verde.
2. **Identificadores verificados** (Parte 2): campos `verifiedEmail/Phone`, `MergeService`,
   auto-merge no WhatsApp (telefone) e no login WorkOS (e-mail).
3. **Vínculo por deep-link**: `linkToken` (TTL) gerado no web; `t.me/<bot>?start=<token>` (Telegram,
   via `ctx.startPayload`) e `wa.me/<num>?text=/vincular <token>` (WhatsApp) → `MergeService`.
   Botões "Vincular Telegram/WhatsApp" no web + indicador "conta vinculada".
4. **Verificação de e-mail no chat** (sentido celular → web): `VerificationService` (WorkOS Magic
   Auth) + comandos `/email` e `/codigo` + estado de verificação. Gated por config (sem WorkOS, os
   comandos respondem "indisponível"; resto do bot intacto).

## Testes
- `MergeService` (reassign por `_id`, união de identities/prefs, resolução de conflito).
- Migração: dry-run conta certo; apply reescreve `userId`.
- `VerificationService`: fluxo de código (WorkOS mockado).
- Atualizar os testes existentes que assumem `userId = externalId`.

## Critérios de aceite
- Compras/gastos/lembretes chaveiam por `User._id`; relatórios somam entre plataformas vinculadas.
- Auto-merge por e-mail (Magic Auth) e por telefone (WhatsApp) funcionam; sem falso-positivo silencioso.
- Telegram/WhatsApp/Web seguem funcionando isolados quando o login/verificação não está configurado.
- Suíte verde.

---

## O que precisa de você
- **WorkOS:** habilitar **Magic Auth** (e-mail) no dashboard. É grátis e rápido. **Nada de SMS.**
- **Username do bot do Telegram** e o **número do WhatsApp** do bot (para montar os deep-links
  `t.me/<bot>` e `wa.me/<num>`). Viram config (`TELEGRAM_BOT_USERNAME`, `WHATSAPP_BOT_NUMBER`).
- **Teste ponta a ponta** com suas contas reais (Telegram + WhatsApp + web logado) ao final.
- Nada de backup/migração de prod — não há dados.

## Fora de escopo (futuro)
- Verificação ativa de telefone por **SMS** (descartada de propósito: custo + ban da conta não-oficial).
- WhatsApp Business API oficial (permitiria OTP por WhatsApp sem risco de ban — é paga).
- Tela de gerenciamento de contas vinculadas no web (além do indicador básico).
