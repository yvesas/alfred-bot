# ADR-0002 — Identidade canônica pelo `User._id`

**Data:** 2026-06 (registrado retroativamente em 2026-08-14)
**Status:** aceito, migração parcial
**Contexto original:** "PLANO-FASE6" — documento perdido

## Contexto

Até a fase 5, a compra era chaveada pelo **id externo da plataforma**
(`Purchase.userId` = id do Telegram). Funcionava com um canal só. Com três
canais, a mesma pessoa virava três usuários e três históricos separados — e não
havia como uni-los depois do fato.

O agravante: a sessão web começa **anônima** (um `clientId` gerado no navegador).
A pessoa conversa, registra gastos, e só então faz login. Esses dados precisam
migrar para a conta real.

## Decisão

**O `User._id` do Mongo é a identidade.** Tudo mais é chave de entrada.

1. `User.identities[]` guarda pares `(platform, externalId)` — um usuário tem
   quantas identidades tiver plataformas. Índice único esparso sobre o par.
2. `Purchase.userId` passa a guardar o `String(User._id)`.
3. Identificadores **verificados** (`verifiedEmail`, `verifiedPhone`) são as
   chaves de fusão automática. Só entram verificados: e-mail pelo WorkOS Magic
   Auth, telefone pela própria plataforma (no WhatsApp o `externalId` **é** o
   número; no Telegram, por "compartilhar contato").
4. `MergeService.mergeUsers` reatribui as compras por `_id`, une identidades,
   categorias e orçamentos, e apaga o documento secundário. A conta com
   identidade **web** é preferida como primária.
5. Três caminhos levam à fusão: deep-link com token de uso único
   (`LinkTokenService`), e-mail verificado, telefone verificado.

## Alternativas descartadas

- **Tabela de vínculo separada** (`account_links`) — mais uma coleção e mais um
  join em todo lookup, sem ganho: `identities[]` embutido resolve com um índice.
- **Pedir login antes de conversar** — mataria o atrito zero, que é o produto.
- **Vincular por e-mail não verificado** — permitiria sequestrar a conta de
  qualquer um digitando o e-mail dele.

## Consequências

**Boas**
- Registrar no Telegram e consultar no painel web é o mesmo dado.
- A sessão anônima é absorvida no login sem o usuário perceber
  (`AccountService.absorbAnonymous`).
- A exclusão de conta (LGPD) apaga tudo por um `_id` só.

**Ruins**
- **A migração não terminou.** O campo legado `telegramId` continua no schema e
  toda query de usuário do Telegram carrega um `$or` — que inutiliza parcialmente
  o índice composto. O script `scripts/migrateCanonical.ts` existe, não tem teste
  e nunca rodou em produção (não há produção).
- `Purchase.userId` é `String`, não `ObjectId` com `ref`. Sem integridade
  referencial: nada impede compra órfã.
- Os lembretes **não** migraram — continuam chaveados por
  `(platform, externalId)`, porque o push precisa saber para onde enviar.
  Coexistem dois esquemas de identidade no mesmo banco.

**Revisitar quando:** houver ambiente de produção para rodar a migração. Aí
remover `telegramId` e o `$or`, e avaliar `ObjectId` + `ref`. Ver C16 e C17 em
`specs/codebase/CONCERNS.md`.
