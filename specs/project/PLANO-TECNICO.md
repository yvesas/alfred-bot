# Plano técnico — endurecimento do Alfred

**Criado em:** 2026-08-17
**Documento vivo.** É a fonte da verdade sobre *o que já foi feito*, *o que está em
andamento* e *o que vem a seguir* no trabalho técnico.

**Referências:** os riscos vêm de [`specs/codebase/CONCERNS.md`](../codebase/CONCERNS.md);
o rumo do produto, de [`ROADMAP.md`](ROADMAP.md); as decisões, de
[`docs/adr/`](../../docs/adr/).

---

## 0. Como usar este documento

| Símbolo | Significado |
|---|---|
| `[ ]` | a fazer |
| `[~]` | em andamento |
| `[x]` | concluído (com data e commit) |
| `[!]` | bloqueado — precisa de decisão |
| `[-]` | descartado ou adiado (com o porquê) |

### O ritual — é isto que mantém a documentação viva

Documentação envelhece porque atualizá-la é uma tarefa à parte. Aqui ela não é:

**Ao começar** uma etapa — mova para `[~]` e anote em §2.

**Ao terminar** — na **mesma branch**, antes do PR:

1. `[x]` aqui, com data e hash.
2. **`STATE.md`** — sempre. É a memória de quem retoma.
3. **`CONCERNS.md`** — se fechou um `C`, risque e escreva **como** foi resolvido.
   Item riscado não é apagado: o histórico do risco é o que impede repeti-lo.
4. **`ROADMAP.md`** — se o plano mudou.
5. **`CHANGELOG.md`** — se o usuário percebe.
6. **ADR** em `docs/adr/` se a decisão é estrutural; uma linha em
   `docs/decisions.md` se é menor.

O checklist do PR cobra os seis. Não é burocracia: este projeto já perdeu sete
documentos de plano que nunca foram commitados, e passou dois meses com o bot
quebrado sem registro.

**Se surgir trabalho novo:** vai para o backlog da fase certa — não incha a fase
atual.

---

## 1. Concluído

| Data | Item | Evidência |
|---|---|---|
| 2026-08-14 | Mapeamento brownfield: `specs/codebase/` com 7 documentos | `2c0cb6e` |
| 2026-08-14 | `docs/` + `specs/` + `CLAUDE.md` — estrutura que não existia | `d97c47a` `53c7fcd` `4c0b46e` |
| 2026-08-14 | **C0/C13** — modelo, região e visão saem do código para configuração | `c56add0` |
| 2026-08-14 | **C12** — falha de OCR vira `OcrError`, não texto do cupom | `c56add0` |
| 2026-08-14 | Fronteira de módulos declarada e testada (ADR-0004) | `8aa8123` |
| 2026-08-14 | Bug do ESLint flat config (lint entrava em `dist/`) | `ce2f41c` |
| 2026-08-17 | ADR-0006 — inteligência e second brain são do Alfred | `baeb135` |
| 2026-08-17 | **C18/C21** — catraca de cobertura, `CONTRIBUTING`, `SECURITY`, `CHANGELOG`, `AGENTS`, `scripts/check.sh` | `bbb312f` |
| 2026-08-17 | Governança: `LICENSE` proprietária, `CODEOWNERS`, Dependabot, template de PR, workflow de auditoria | *(este trabalho)* |

---

## 2. Em andamento

> **▶ ESTADO (2026-08-17)**
>
> Branch `docs/codebase-mapping`, ainda sem PR. Suíte em **189 testes / 35 suítes**,
> cobertura 76,2 %, `./scripts/check.sh` verde nos dois projetos.
>
> **Iniciando a Fase 1 — C6 e C7.**

- [~] **F1.1 — C6** rate limit nos endpoints HTTP
- [ ] **F1.2 — C7** origem explícita em produção

---

## 3. Fase 1 — Fechar o que dá para explorar hoje 🔴

São as duas únicas fraquezas exploráveis **sem** acesso ao banco ou à máquina.
Ambas em `bot/src/infra/authServer.ts` e `bot/src/infra/config.ts`.

### F1.1 — `C6` Rate limit nos endpoints HTTP

**O problema:** o `RateLimiter` só é chamado pelo `BotCore`. O `AuthServer` está
aberto. `POST /auth/email/start` dispara e-mail pelo WorkOS **sem limite nenhum**:
dá para queimar a cota da conta, usar o Alfred para spammar terceiros, e enumerar
quem tem conta. `/api/*` aceita força bruta de JWT sem freio.

**Como fazer:** aplicar o `RateLimiter` por IP na entrada do `handle()`, com janela
mais apertada em `/auth/email/*` do que no resto. O `RateLimiter` já existe e já é
singleton — não precisa de dependência nova.

**Cuidados:**
- IP atrás de proxy vem em `x-forwarded-for`; confiar nele **só** quando houver
  proxy declarado, senão o cliente forja o próprio IP e o limite vira decoração.
- Responder **429** com `Retry-After`, não 400.
- Não vazar se o e-mail existe — a resposta de `/auth/email/start` já é sempre a
  mesma, e precisa continuar sendo.

**Done when:** teste de integração prova que a N+1ª chamada em janela recebe 429;
o limite de `/auth/email/*` é mais apertado que o de `/api/*`; nenhum teste
existente do `authServer` quebra.
**Testes:** integração · **Gate:** `./scripts/check.sh bot`

### F1.2 — `C7` Origem explícita em produção

**O problema:** `WEB_ALLOWED_ORIGIN` e o CORS do `AuthServer` caem em `*` quando
não configurados. O default **falha aberto**: esquecer a variável em produção abre
o WebSocket e a API para qualquer site.

**Como fazer:** quando `NODE_ENV=production`, `assertRequiredConfig()` exige
`WEB_ALLOWED_ORIGIN` e `WEB_APP_URL` — e recusa `*` explícito. Em desenvolvimento,
segue permissivo.

**Cuidados:**
- Falhar **no startup**, com a lista do que falta, como já é feito para
  `DATABASE_URL` e `TELEGRAM_TOKEN`. Não descobrir em runtime.
- O `docker-compose.yml` já define as duas para dev; conferir que continua subindo.

**Done when:** teste prova que `assertRequiredConfig` lança em produção sem as
variáveis, e que aceita em desenvolvimento; o compose sobe sem alteração.
**Testes:** unit · **Gate:** `./scripts/check.sh bot`

---

## 4. Fase 2 — Cobrir os adapters `C5`

Telegram e WhatsApp têm **0 % de cobertura** — e é ali que mora o footgun de cada
plataforma: foto em várias resoluções, contato de terceiro, JID de grupo,
reconexão. Quebra ali é silenciosa até um usuário reclamar.

- [ ] **F2.1** — testar as funções de tradução do `TelegramAdapter` (`toText`,
      `toCommand`, `toPhoto`, `handleContact`) com fixtures sintéticas de update
- [ ] **F2.2** — testar `WhatsAppAdapter.toIncoming`: texto em `conversation` **e**
      em `extendedTextMessage`, imagem, comando conhecido e desconhecido, e o
      descarte de grupo/status/própria
- [ ] **F2.3** — subir a catraca de cobertura para o novo patamar

Não precisa de rede: as funções são puras. `WebAdapter.processRaw` já mostra o
padrão. **Testes:** unit · **Gate:** `./scripts/check.sh bot`

---

## 5. Fase 3 — Quebrar o `BotCore` `C4`

1042 linhas, 15 dependências, `switch` de 19 casos, **58 % de cobertura** — a menor
do projeto, no arquivo com mais regra. **Fazer antes da UX de conversa (F3 do
roadmap), não depois.**

- [ ] **F3.1** — `CommandHandler`: um handler por comando, registrado num `Map`,
      resolvido pelo registro de módulos que já existe
- [ ] **F3.2** — mover os handlers do módulo fin para `modules/fin/commands/`
- [ ] **F3.3** — extrair `PurchaseFlow` (`handleProcessed` → confirmação →
      `savePurchase` → alerta de orçamento)
- [ ] **F3.4** — `BotCore` fica só com: normalizar, resolver usuário, rate limit,
      despachar
- [ ] **F3.5** — subir a catraca de cobertura

Refactor sem mudança de comportamento: **a suíte atual é o contrato.** Se um teste
precisou mudar, ou o refactor mudou comportamento ou o teste testava a implementação.
**Gate:** `./scripts/check.sh`

---

## 6. Fase 4 — Deixar rodar com mais de uma instância `C2` `C3`

Só bloqueia quando houver deploy com réplica — mas bloqueia **inteiro**.

- [ ] **F4.1** — tirar da memória: `pendingPurchases`, `pendingEmailVerification`,
      `LinkTokenService`, `RateLimiter`. Todos já estão atrás de uma classe.
- [ ] **F4.2** — lock nos schedulers (`findOneAndUpdate` com `lockedUntil`), senão
      N réplicas mandam N vezes o mesmo lembrete e a purga de retenção — que
      **apaga contas** — roda concorrente
- [ ] **F4.3** — `C8` JWT revogável (`tokenVersion` no `User`): é o mínimo para
      atender a um pedido de revogação do titular (LGPD)

**[!] Bloqueado por decisão:** Redis, ou coleção Mongo com TTL index? Redis é o
caminho óbvio e mais uma peça de infra para hospedar. Decidir junto com o host.

---

## 7. Backlog — sem fase

Riscos catalogados que não entram nas quatro fases acima:

| Id | O quê | Quando |
|---|---|---|
| `C9` | `/editar` e `/excluir` carregam o histórico inteiro | junto com a F3 |
| `C10` | três agregações por compra registrada | quando o custo aparecer |
| `C11` | GPT não lê imagem e o usuário não é avisado | quando houver escolha de modelo de verdade |
| `C14` | entrada externa validada à mão, sem schema (Zod) | junto com a F2 |
| `C15` | `validatePurchaseData` responde fora do i18n | avulso, barato |
| `C16` `C17` | `Purchase.userId` como `ObjectId`; remover `telegramId` legado | exige migração e produção |
| `C19` | ruído de `dynamic import` no teste do QR | avulso |
| `C20` | `ocr-service` sem teste e sem imagem construída | se o custo de OCR pesar |

---

## 8. Decisões deste plano

| Data | Decisão | Por quê |
|---|---|---|
| 2026-08-17 | **LICENSE proprietária**, não open-source | O Alfred é produto, não infraestrutura. O `yas-harness` é que é Apache 2.0 — é ele que outros produtos consomem |
| 2026-08-17 | **CodeQL fica de fora** | Em repositório privado exige GitHub Advanced Security (Team/Enterprise, por committer ativo). Foi condicionado a ser gratuito |
| 2026-08-17 | **`pnpm audit` no lugar**, semanal e no PR | Gratuito, e cobre onde está a maior parte do risco real num projeto deste tamanho: as dependências |
| 2026-08-17 | Dependabot com updates **agrupados** | Um PR por ecossistema por semana. Um PR por pacote vira ruído, e ruído faz parar de olhar |
| 2026-08-17 | Ordem: segurança → testes → refactor → escala | O que dá para explorar hoje vem antes do que só incomoda amanhã |

**[!] A confirmar com você:** o titular no `LICENSE` está como *YAS Softwares LTDA*
— mesma entidade do `yas-harness`. Se for outra, é uma linha.

**Se o repositório virar público** ou o plano subir para Team: trocar
`.github/workflows/security.yml` por CodeQL, que é análise semântica de verdade —
no `yas-harness` ele pegou um ReDoS real que nenhuma auditoria de dependência
acharia.
