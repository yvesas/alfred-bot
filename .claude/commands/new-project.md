---
description: Cria um projeto novo em yaslabs/ com docs/, specs/ e as guardas do workspace
argument-hint: <nome-do-projeto> [uma linha do que é]
allowed-tools: Bash(git -C *), Bash(git init*), Bash(git config*), Bash(mkdir*), Bash(chmod*), Bash(cp*), Bash(ls*), Read, Write, Edit
---

Faça o scaffold de um projeto novo dentro de `yaslabs/`, no padrão do workspace.

Entrada do usuário: `$ARGUMENTS` — primeiro token é o nome (kebab-case); o resto,
a descrição de uma linha.

## Step 0 — Guardas

```bash
git rev-parse --show-toplevel 2>/dev/null   # vazio = estou num workspace, não num projeto
ls -d <workspace>/<nome>
```

- **O diretório atual já é um repositório git?** PARE. Este comando cria projeto
  **no workspace**, ao lado dos outros — não dentro de um projeto existente. O
  baseline é instalado em todo projeto, então este comando também aparece lá;
  isso não significa que seja para usar lá.
- **Pasta já existe?** PARE e pergunte: continuar dentro dela ou escolher outro nome.
- Nome fora de kebab-case → normalize e confirme com o usuário.

## Step 1 — Entender o projeto antes de criar arquivo

Não gere `PROJECT.md` com placeholder. Pergunte, de forma conversacional (não
como checklist), o que ainda não estiver claro na conversa:

- Que problema resolve, e para quem?
- Qual o stack (runtime, banco, framework)? Já está decidido ou é escolha em aberto?
- Existe uma **golden rule** — uma invariante que domina as decisões do projeto?
  (ex.: *"o harness nunca conhece domínio de produto"*). Se existir, ela precisa
  vir com um **teste operacional**, não como slogan.
- O que está explicitamente **fora** de escopo?

Se o usuário ainda não souber algo, registre como decisão em aberto no `STATE.md`
em vez de inventar.

## Step 2 — Estrutura

```bash
mkdir -p <nome>/{docs/adr,docs/runbooks,specs/project,specs/features,specs/quick,src,tests}
```

## Step 3 — Git + baseline de convenções

```bash
cd <nome>
git init -b main
```

Instale o baseline — ele traz `.claude/` (settings, hooks, rules, commands,
skills) e o `.githooks/commit-msg`, e aponta o `core.hooksPath`:

```bash
../claude-base/bin/install .
```

> **Por que copiar para dentro do projeto:** sessão de Claude Code no celular ou
> na web clona o repositório do projeto. Um `.claude/` que viva na pasta do
> workspace não existe naquela sessão. As regras só valem em todo lugar se
> estiverem versionadas junto do código.

No `package.json`, garanta que o hook se instala sozinho para quem clonar:

```json
"scripts": { "prepare": "git config core.hooksPath .githooks" }
```

**Verifique o hook antes de seguir** — hook que não roda é pior que nenhum,
porque dá falsa sensação de segurança:

```bash
printf 'chore: test\n\nCo-Authored-By: Someone <x@y.z>\n' > /tmp/msg && \
  .githooks/commit-msg /tmp/msg; echo "exit=$?  (esperado: 1)"
```

## Step 4 — `.gitignore` e `.env.example`

`.gitignore` barra `.env*` (exceto `.env.example`), `node_modules`, `dist`,
`coverage`, `.DS_Store`. `.env.example` versionado com **só os nomes** das
variáveis e um comentário do que cada uma é.

## Step 5 — `CLAUDE.md` do projeto

Máximo ~80 linhas, no formato de índice (ver `claude-base/CONVENCOES.md` §1):
o que é · golden rule com teste · stack · arquitetura (tabela pasta →
responsabilidade) · comandos · convenções (link para `.claude/rules/`) ·
commit e PR · footguns conhecidos · onde ficam `docs/` e `specs/`.

Crie também um `AGENTS.md` de ~10 linhas apontando para o `CLAUDE.md` e repetindo
as regras inegociáveis (golden rule + sem atribuição de IA).

## Step 6 — `specs/project/`

Use a skill **`spec-driven`** (`initialize project`) para gerar `PROJECT.md`,
`ROADMAP.md` e `STATE.md` a partir do que foi levantado no Step 1. Não escreva
esses três à mão fora da skill — ela define o formato que os comandos seguintes
esperam.

## Step 7 — Verificar e resumir

```bash
find <nome> -type f -not -path "*/node_modules/*" | sort
```

Mostre a árvore criada, confirme que o hook `commit-msg` rejeita
`Co-Authored-By` (resultado do Step 3), e sugira o próximo passo: especificar a
primeira feature com `/spec`.

**Não** faça o primeiro commit sem o usuário pedir, e **não** crie repositório
remoto no GitHub por conta própria — é ação externa, precisa de aprovação
explícita.
