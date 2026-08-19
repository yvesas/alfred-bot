# Plano técnico — endurecimento do Alfred

**Criado em:** 2026-08-17
**Documento vivo.** É a fonte da verdade sobre *o que já foi feito*, *o que está em
andamento* e *o que vem a seguir* no trabalho técnico.

**Referências:** os riscos vêm de [`specs/codebase/CONCERNS.md`](../codebase/CONCERNS.md);
o rumo do produto, de [`ROADMAP.md`](ROADMAP.md); as decisões, de
[`docs/adr/`](../../docs/adr/).

---

## As fases, num quadro

| Fase | O quê | Risco | Estado |
|---|---|---|---|
| **1** | Rate limit no HTTP · origem explícita em produção | `C6` `C7` | ✅ **2026-08-17** |
| **2** | [Cobrir os adapters de Telegram e WhatsApp](#4-fase-2--cobrir-os-adapters-c5) | `C5` | ✅ **2026-08-18** |
| **3** | [Quebrar o `BotCore`](#5-fase-3--quebrar-o-botcore-c4) — de 1042 para 336 linhas | `C4` | ✅ **2026-08-18** |
| **4** | [Rodar com mais de uma instância](#6-fase-4--deixar-rodar-com-mais-de-uma-instância-c2-c3) | `C2` `C3` `C8` | ✅ **2026-08-19** |

**Por que os adapters vêm antes de quebrar o `BotCore`.** A Fase 3 é refactor sem
mudança de comportamento, e **a suíte é o contrato que prova isso**. Fazer a Fase 3
com os adapters em 0 % é refatorar sem rede: se a tradução
`Telegram → IncomingMessage` quebrar, ninguém descobre até um usuário reclamar.

Fora das fases: **rotacionar a chave do GCP** (`C1`) não espera fila — é ação sua e
independe de tudo aqui.

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
| 2026-08-17 | Governança: `LICENSE` proprietária, `CODEOWNERS`, Dependabot, template de PR, workflow de auditoria | `97bafcb` |
| 2026-08-17 | **C6** — rate limit por IP no `AuthServer`, apertado em `/auth/email/*` | *(fase 1)* |
| 2026-08-17 | **C7** — origem explícita exigida em produção | `e2ad618` |
| 2026-08-18 | **C5** — tradução dos adapters extraída para `translate.ts` e coberta a 100 % | *(fase 2)* |

---

## 2. Em andamento

> **▶ ESTADO (2026-08-18)**
>
> Branch `docs/codebase-mapping`, ainda sem PR. **Fases 1 e 2 concluídas.**
> Suíte em **243 testes / 39 suítes**, cobertura 76,9 %, `./scripts/check.sh` verde
> nos dois projetos.
>
> **Fases 1, 2 e 3 concluídas.** O `BotCore` caiu de **1042 para 336 linhas** — 68 %
> — sem uma única mudança de comportamento. 259 testes verdes, cobertura 78,2 %.
>
> **Fase 4 em andamento.** `C3` fechado: os dois schedulers rodam sob lock de Mongo,
> com 277 testes verdes — inclusive um que prova, com banco de verdade, que cinco
> instâncias disputando resultam em uma vencedora.
>
> **As quatro fases estão fechadas.** 303 testes, cobertura 78,7 %, gate verde.
>
> O plano nasceu com 4 riscos altos e 2 críticos em aberto; hoje `C0` `C2` `C3` `C4`
> `C5` `C6` `C7` `C8` `C12` `C13` `C18` `C21` estão fechados. Sobrou `C1` — rotacionar
> a chave do GCP, que é ação sua — e o backlog de §7.
>
> **O que vem depois não é mais deste plano:** é o produto (`ROADMAP.md`), com a
> proatividade à frente.

- [x] **F1.1 — C6** rate limit nos endpoints HTTP · 2026-08-17
- [x] **F1.2 — C7** origem explícita em produção · 2026-08-17
- [x] **F2.1** tradução do Telegram coberta · 2026-08-18
- [x] **F2.2** tradução do WhatsApp coberta · 2026-08-18
- [x] **F2.3** catraca subida para 76/61/76/77 · 2026-08-18
- [x] **F3.1** `PurchaseFlow` extraído para o módulo fin · 2026-08-18
- [x] **F3.2** contrato de comando + 9 comandos do fin no módulo · 2026-08-18
- [x] **F3.3** os 8 comandos do chassi saem do `switch` · 2026-08-18
- [x] **F3.4** `BotCore` fica só com o chassi · 2026-08-18

---

## 3. Fase 1 — Fechar o que dá para explorar hoje ✅ *(concluída em 2026-08-17)*

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

## 4. Fase 2 — Cobrir os adapters `C5` ✅ *(concluída em 2026-08-18)*

Telegram e WhatsApp estavam em **0 % de cobertura** — e é ali que mora o footgun de
cada plataforma: foto em várias resoluções, contato de terceiro, JID de grupo.
Quebra ali é silenciosa até um usuário reclamar.

- [x] **F2.1** — tradução do `TelegramAdapter` coberta
- [x] **F2.2** — tradução do `WhatsAppAdapter` coberta
- [x] **F2.3** — catraca subida para 76/61/76/77

**O que apareceu ao fazer:** o Baileys é ESM puro e o Jest do projeto é CommonJS —
qualquer arquivo que importasse o SDK era **intestável**. Os 0 % não eram desleixo,
eram bloqueio. A tradução saiu para `platforms/<canal>/translate.ts`, sem SDK
nenhum; os dois módulos ficaram em **100 %**. O Telegram foi junto, por simetria.

**Fica de fora, e é honesto dizer:** o ciclo de vida dos adapters — conexão,
reconexão, QR, download de mídia — continua sem teste. Depende de SDK e de rede.

---

## 5. Fase 3 — Quebrar o `BotCore` `C4`

1042 linhas, 15 dependências, `switch` de 19 casos, **58 % de cobertura** — a menor
do projeto, no arquivo com mais regra. **Fazer antes da UX de conversa (F3 do
roadmap), não depois.**

- [x] **F3.1** — `PurchaseFlow` no módulo fin: `handleProcessed`, confirmação,
      gravação, alerta de orçamento e consulta de gastos
- [x] **F3.2** — contrato `CommandDefinition` + registro; os 9 comandos do fin
      vivem em `modules/fin/commands.ts`
- [x] **F3.3** — os 8 comandos do chassi em `core/chassisCommands.ts`
- [x] **F3.4** — `BotCore` fica só com normalizar, rate limit, resolver usuário e despachar
- [x] **F3.5** — catraca em 77/62/77/77

**Resultado: 1042 → 336 linhas, 68 % a menos.** Não existe mais `switch` de comando
em lugar nenhum. O que sobrou no `BotCore` é chassi de verdade: os fluxos de
texto/foto/contato, o onboarding e o despacho.

**O que apareceu no caminho:**
- Dois pedaços de estado ganharam dono — `PendingEmailStore` e `AccountLinking` —
  em vez de serem campo e método privados compartilhados por handlers distantes.
  Isso encurta a Fase 4: o estado que impede a réplica está em três classes.
- A catraca de cobertura **pegou uma queda real** (branches 62,39 → 61,96) logo
  depois do refactor. Cobrir os desvios novos do despacho — comando sem nome, comando
  sem dono, módulo não construído — resolveu e valeu por si.
- Um teste que eu escrevi estava errado: assumia que **todo** comando conhecido tem
  handler. `/tarefas` e `/projetos` não têm, de propósito. O invariante certo é
  "tem handler **ou** o módulo dono está declarado como não construído".

Refactor sem mudança de comportamento: **a suíte atual é o contrato.** Se um teste
precisou mudar, ou o refactor mudou comportamento ou o teste testava a implementação.
**Gate:** `./scripts/check.sh`

---

## 6. Fase 4 — Deixar rodar com mais de uma instância `C2` `C3` `C8` ✅ *(concluída em 2026-08-19)*

Só bloqueia quando houver deploy com réplica — mas bloqueia **inteiro**.

- [x] **F4.2** — lock nos schedulers · 2026-08-18 (feito primeiro: não dependia da decisão)
- [x] **F4.1** — estado de conversa no Mongo com TTL; rate limit em memória com teto
      dividido por `REPLICAS` · 2026-08-18
- [x] **F4.3** — `C8` JWT revogável (`tokenVersion` no `User`) · 2026-08-19

**Decidido em 2026-08-18: Mongo.** O host ainda não foi escolhido, e adotar Redis
agora seria escolher um host que tenha Redis. A troca depois é por classe — cada um
dos quatro já tinha dono desde o C4.

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
