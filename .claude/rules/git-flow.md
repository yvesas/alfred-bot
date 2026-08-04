# Regra — Fluxo Git

> Vale para todo projeto dentro de `yaslabs/`. Cada projeto é um repo próprio;
> o workspace não é.
> Enforçada por: hook `commit-msg` do projeto, hooks do Claude
> (`guard-main-bash`), `deny` no `.claude/settings.json` e branch protection no
> GitHub.

## Atribuição de IA — inegociável

**Nunca** inserir em mensagem de commit, título ou corpo de PR, comentário de
issue ou release note:

- `Co-Authored-By:` (qualquer co-autor de ferramenta)
- `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- "Generated with / by …", assinatura de ferramenta, endereço de bot

O código é do time e a responsabilidade é de quem committa. O hook `commit-msg`
rejeita; **não contorne com `--no-verify`** — o `settings.json` também nega isso.

## Branches

- Tudo sai de `main` e volta para `main` via Pull Request. Nunca commit ou push
  direto na `main`.
- Formato: `<tipo>/<slug-curto>/<issue>` → `feat/refresh-token/12`
- Sem issue, omita o sufixo: `chore/bump-deps`
- Slug em kebab-case, 3–6 palavras, sem acento.

## Commits

- **Conventional Commits**: `<tipo>(<escopo>): <descrição>`
- Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`,
  `ci`, `style`
- Descrição em **inglês**, imperativo, minúscula, subject < 72 caracteres.
- `feat(auth): add refresh token rotation` · `fix(kanban): keep sprint counters on conclude`
- Commits **atômicos e agrupados por assunto**. Se o diff mistura assuntos,
  divida. Poucos commits coerentes > um commit por arquivo.
- Rodar lint + typecheck + testes **antes** de commitar. Falhou, conserta —
  não bypassa.

## Pull Requests

- Sempre contra `main`, **squash merge**. O título do PR vira o commit na `main`,
  então segue o mesmo formato de commit.
- **Rebase, nunca merge** de `main` na branch: `git fetch origin && git rebase origin/main`.
- Se o rebase reescreveu commits já enviados: `--force-with-lease`, nunca `--force`.
- Um assunto por PR. Referenciar a issue no título ou corpo.
- Corpo do PR: o que, por quê, como testar. Sem footer de ferramenta.

## Releases

Quando o projeto usa deploy por tag: `v<semver>-<AAAA-MM-DD>`, criada por script
versionado (nunca versão calculada à mão), com `CHANGELOG.md` atualizado e
mergeado **antes** da tag.
