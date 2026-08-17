# Infraestrutura de testes

**Analisado:** 2026-08-14 · **Suíte executada nesta análise — toda verde.**

| Projeto | Framework | Suítes | Testes | Cobertura (statements) |
|---|---|---|---|---|
| `bot/` | Jest 29 + ts-jest | 33 | **177** | **75,98 %** (branch 60,37 · funcs 74,74) |
| `web/` | Vitest 2.1 + RTL | 8 | **21** | não medida em CI |

> O `ROADMAP` antigo dizia "153 testes no bot / 20 no web". Os números acima são
> os reais, medidos em 2026-08-14.

## Frameworks

**Bot** — Jest 29 (`jest.config.cjs`: `testEnvironment: "node"`, `roots: src/`,
ignora `dist/`), transform por `ts-jest`. Dublês com **sinon 19** (20 das 33
suítes). Banco real em memória com **`mongodb-memory-server` 11**.

**Web** — Vitest 2.1 configurado dentro do `vite.config.ts`
(`environment: "jsdom"`, `globals: true`, `setupFiles: ./src/test-setup.ts`),
com React Testing Library 16 e `@testing-library/user-event`.
Cobertura por `@vitest/coverage-v8`.

## Organização

| | Bot | Web |
|---|---|---|
| Local | `src/tests/`, **separado** do código | **ao lado** do arquivo testado |
| Nome | `<Alvo>.test.ts` | `<Alvo>.test.ts(x)` |
| Subpastas | espelham a origem (`tests/converters/`) | — |
| Helpers | `src/tests/helpers/memoryMongo.ts` | `src/test-setup.ts`, `src/test-utils.tsx` |

## Padrões por tipo

### Unit (a maioria)

Sem rede e sem banco. As dependências entram pelo construtor (o código é todo DI),
então o teste instancia a classe passando stubs de sinon — **o container do
Inversify não é usado nos testes**. Cobre regra de negócio e caso de borda:
`MergeService` (fusão de contas), `BudgetService` (limiares 80 %/100 %),
`PlanService`, `RateLimiter` (janela deslizante), `fiscalKey` (DV mód-11),
`validatePurchaseData`, o catálogo i18n.

### Integração com banco

`PurchaseRepository`, `UserRepository` e `ReminderRepository` sobem um **MongoDB
real em memória** e exercitam as queries e agregações de verdade — `$facet`,
`$unwind`, índices únicos parciais. Ciclo: `connectMemoryMongo()` no `beforeAll`,
`clearCollections()` no `beforeEach`, `disconnectMemoryMongo()` no `afterAll`.

### Integração HTTP

`authServer.test.ts` sobe o servidor de verdade numa porta e bate nos endpoints
(`/auth/email/*`, `/api/*`), com o WorkOS stubado.

### Componente (web)

RTL renderizando de verdade e interagindo por `user-event`, com `fetch` mockado.
Cobre `LoginModal` (fluxo de 2 passos), `Dashboard` e `Privacy`.

### E2E

**Não existe.** Nenhum Playwright/Cypress, nenhum teste do caminho
foto → OCR → IA → persistência ponta a ponta.

### Teste "live"

**Não existe** nenhum `describe.skip` nem gate por `*_LIVE_TEST`. Todo acesso a
serviço externo (Vertex AI, OpenAI, Vision, WorkOS, Telegram, WhatsApp) é
stubado — a suíte roda offline.

## Matriz de cobertura por camada

| Camada | Teste exigido | Onde fica | Comando |
|---|---|---|---|
| `bot/src/services/**` | unit (sinon) | `bot/src/tests/<Service>.test.ts` | `cd bot && pnpm test` |
| `bot/src/repositories/**` | integração (Mongo em memória) | `bot/src/tests/<Repo>.test.ts` | `cd bot && pnpm test` |
| `bot/src/core/BotCore.ts` | unit por handler (sinon) | `bot/src/tests/BotCore.test.ts` | `cd bot && pnpm test` |
| `bot/src/infra/authServer.ts` | integração HTTP | `bot/src/tests/authServer.test.ts` | `cd bot && pnpm test` |
| `bot/src/infra/converters/**` | unit | `bot/src/tests/converters/*.test.ts` | `cd bot && pnpm test` |
| `bot/src/utils/**` | unit | `bot/src/tests/<util>.test.ts` | `cd bot && pnpm test` |
| `bot/src/models/**` | nenhum direto | coberto pelos testes de repositório | — |
| `bot/src/platforms/web/**` | unit (`processRaw`, sem socket) | `bot/src/tests/WebAdapter.test.ts` | `cd bot && pnpm test` |
| `bot/src/platforms/{telegram,whatsapp}/**` | **nenhum** ⚠️ | — | ver `CONCERNS.md` |
| `bot/src/scripts/**` | **nenhum** ⚠️ | — | ver `CONCERNS.md` |
| `web/src/lib/**` | unit | `web/src/lib/<mod>.test.ts` | `cd web && pnpm test` |
| `web/src/pages/**`, `features/**` | componente (RTL) | ao lado do arquivo | `cd web && pnpm test` |
| `ocr-service/**` | **nenhum** ⚠️ | — | ver `CONCERNS.md` |

**Regra do workspace:** o teste entra na **mesma task** do código. Camada nova de
service ou repository nasce com teste no `Done when`.

## Paralelismo

| Tipo | Paralelo? | Isolamento | Evidência |
|---|---|---|---|
| Unit (bot) | **Sim** | tudo stubado por sinon, sem estado global | 20 suítes com stubs por teste |
| Repositório (bot) | **Sim** | **uma instância de Mongo por arquivo de teste** — cada worker do Jest tem seu próprio module registry, logo seu próprio `mongod` e sua própria URI | `helpers/memoryMongo.ts` (`MongoMemoryServer.create()` em escopo de módulo) |
| HTTP (bot) | **Sim** | servidor sobe em porta própria dentro da suíte | `authServer.test.ts` |
| Web (vitest) | **Sim** | jsdom por arquivo, `fetch` mockado | `vite.config.ts` |

Jest e Vitest rodam em paralelo por padrão e **não** foi preciso `--runInBand`.
Nenhum teste toca banco de desenvolvimento — a suíte **não** derruba dado local.

## Gates

| Nível | Quando | Comando |
|---|---|---|
| Rápido | task que só mexeu em `bot/` | `cd bot && pnpm lint && pnpm typecheck && pnpm test` |
| Rápido (web) | task que só mexeu em `web/` | `cd web && pnpm lint && pnpm typecheck && pnpm test` |
| Completo | task que atravessa os dois | os dois acima |
| Build | fim de fase / antes do PR | acima + `cd web && pnpm build` |
| Cobertura | quando o alvo é cobertura | `cd bot && pnpm test:coverage` |

**Automação já ativa:**

- `pre-commit` (husky, na raiz) → `lint-staged` + `typecheck`, **só nos projetos
  com arquivo staged**.
- `pre-push` → `pnpm test` nos **dois** projetos.
- CI path-filtered: `bot.yml` (lint · typecheck · test:coverage → Codecov, com
  cache do binário do MongoDB), `web.yml` (lint · typecheck · test · build),
  `ocr-service.yml`.

> **Hooks moram em dois lugares.** `core.hooksPath` aponta para `bot/.husky/_`
> (husky), não para `.githooks/`. O guard de atribuição de IA está em
> `bot/.husky/commit-msg` e **funciona** — verificado em 2026-08-14 rejeitando um
> `Co-Authored-By`. O `.githooks/commit-msg` do baseline é a cópia de referência e
> hoje fica inerte. Ao mexer em hooks, altere os dois.

## Limiar de cobertura

**Não há `coverageThreshold`** no Jest nem gate de cobertura no CI — o Codecov
apenas reporta. Nada quebra o build se a cobertura cair.
