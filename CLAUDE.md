# Alfred — índice para o agente

**Assistente pessoal no chat** (Telegram · WhatsApp · web) com capacidades em
**módulos**: `fin` (implementado), `tarefas` e `projetos` (declarados, não
construídos). Mesma conta nas três plataformas.

"Alfred" é codinome — o nome comercial ainda não existe. Ver
`docs/adr/0004-alfred-modular.md`.

**Monorepo com três projetos independentes** — cada um com seu gerenciador, lint,
testes e Dockerfile. Não há workspace pnpm unificado.

| Pasta | O que é | Stack |
|---|---|---|
| `bot/` | aplicação principal | TypeScript · Telegraf · Baileys · `ws` · Inversify · Mongoose |
| `web/` | frontend (chat + painel) | React · Vite · Tailwind · React Router |
| `ocr-service/` | OCR self-hosted, **opcional** | Python · FastAPI · PaddleOCR |

## Por onde começar

| Pergunta | Arquivo |
|---|---|
| **Estou voltando ao projeto** | **`specs/project/HANDOFF.md`** |
| Em que pé está o projeto? | `specs/project/STATE.md` |
| O que vem depois, no produto? | `specs/project/ROADMAP.md` |
| O que vem depois, no código? | **`specs/project/PLANO-TECNICO.md`** |
| Qual a visão e os limites? | `specs/project/PROJECT.md` |
| Como o sistema é hoje? | `docs/architecture.md` |
| Por que foi decidido assim? | `docs/adr/` · `docs/decisions.md` |
| Como rodo e testo? | `docs/runbooks/uso-e-teste.md` |
| O que é arriscado mexer? | **`specs/codebase/CONCERNS.md`** |
| Onde mora cada coisa? | `specs/codebase/STRUCTURE.md` |
| Que padrão o código segue? | `specs/codebase/CONVENTIONS.md` |
| Que teste esta camada exige? | `specs/codebase/TESTING.md` |

## Comandos

```bash
cd bot && pnpm dev              # nodemon + ts-node
cd bot && pnpm lint && pnpm typecheck && pnpm test    # 35 suítes · 189 testes
cd web && pnpm dev              # Vite em :5173
cd web && pnpm lint && pnpm typecheck && pnpm test    # vitest · 21 testes
```

**Gate antes de considerar pronto:** os dois comandos acima, nos projetos
tocados (`pnpm test:coverage` no bot quando o alvo for cobertura). Detalhe em
`specs/codebase/TESTING.md`. A suíte **não** toca banco de desenvolvimento — os
testes de repositório sobem um MongoDB em memória, um por arquivo.

## Regras específicas deste repo

- **Não suba o Docker sem pedido explícito.** O `docker-compose.yml` monta a
  credencial real do GCP e sobe Mongo, bot e front.
- **Nunca leia nem escreva `bot/src/config/google-credentials.json`.** É a chave
  real de service account (gitignored). Ver C1 em `specs/codebase/CONCERNS.md`.
- **String de usuário sempre pelo i18n** (`t(lang, "chave")`), nunca literal no
  `BotCore`. O catálogo é tipado: chave nova exige pt, en **e** es, senão não
  compila.
- **Comando novo de módulo entra no `module.ts` do módulo**, não em
  `core/commands.ts` — o catálogo é derivado. Comando do chassi (conta, idioma)
  entra em `CHASSIS_COMMANDS`. Nos dois casos, registre também no
  `TelegramAdapter`.
- **`process.env` só em `infra/config.ts`.** Variável obrigatória entra também em
  `assertRequiredConfig()`.
- **Dependência externa fica atrás de interface** (`IOcrProvider`,
  `IMessageProcessor`, `IMessagingAdapter`). O domínio não conhece o fornecedor.
- **Módulo sabe domínio; chassi não sabe.** Se o código não serviria igual num
  assistente que nunca ouviu falar de dinheiro, não é módulo. Ver
  `bot/src/modules/README.md`.
- **Id de modelo de IA é configuração, nunca literal no código.** Um modelo
  hardcoded já derrubou o bot por dois meses sem ninguém ver.
- **Gateway de modelo é do chassi; inteligência é do Alfred.** Não construa
  gateway nem triagem genérica aqui (`yas-harness`, ADR-0005). Mas **RAG, second
  brain, memória entre módulos e a escolha de modelo pelo usuário são deste
  projeto** — é o diferencial. Ver ADR-0006.
- **Hooks de git moram em `bot/.husky/`**, não em `.githooks/` — `core.hooksPath`
  aponta para lá. Mudança de hook precisa ir nos dois.
- O bot é **CommonJS** (`module: CommonJS`), não ESM: import relativo **sem** a
  extensão `.js`. O `web/` é ESM.

## Armadilhas conhecidas

Catálogo completo em `specs/codebase/CONCERNS.md`. As quatro que mais mordem:

- `BotCore.ts` tem 1042 linhas e 58 % de cobertura — leia **C4** antes de mexer
  em UX de conversa.
- Adapters de **Telegram e WhatsApp sem nenhum teste** (**C5**).
- `GptProcessor` **não** lê imagem; `/ia gpt` cai no caminho OCR (**C11**).
- Compras pendentes, tokens de vínculo e rate limit vivem **em memória** —
  reiniciar perde, e o projeto **não** roda com réplica (**C2**, **C3**).

## Convenções do workspace

Valem as regras de `.claude/rules/` — git-flow, code-style, secrets, testing,
docs-e-specs. A inegociável: **nunca inserir atribuição de IA** em commit, PR ou
issue. O hook `commit-msg` rejeita e `--no-verify` está negado.
