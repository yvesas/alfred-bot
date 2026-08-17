# Contribuindo

O hook `commit-msg` manda você ler este arquivo quando rejeita um commit. Aqui
está o porquê de cada regra.

## Antes de começar

Leia o [`CLAUDE.md`](./CLAUDE.md) — comandos, gate e armadilhas — e, se for mexer
em algo arriscado, [`specs/codebase/CONCERNS.md`](./specs/codebase/CONCERNS.md).

Rode uma vez para instalar os hooks:

```bash
cd bot && pnpm install    # o `prepare` aponta core.hooksPath para bot/.husky
```

## O gate

```bash
./scripts/check.sh          # os dois projetos — espelha o CI
./scripts/check.sh bot      # só o bot
```

Se não passa, não está pronto. Não contorne com `--no-verify`: está negado no
`.claude/settings.json` e não resolve — o CI roda a mesma coisa.

Cobertura tem catraca (`coverageThreshold` no `bot/jest.config.cjs`). Ela existe
porque a cobertura já caiu em silêncio antes — o `BotCore` chegou a 58 %. Ao subir
a cobertura de verdade, suba o limiar junto.

## Branches

Tudo sai de `main` e volta por Pull Request. **Nunca commit ou push direto na
`main`** — há hook e branch protection.

```
<tipo>/<slug-curto>/<issue>     feat/refresh-token/12
<tipo>/<slug-curto>             chore/bump-deps
```

Slug em kebab-case, 3–6 palavras, sem acento.

## Commits

**Conventional Commits**, descrição em **inglês**, imperativo, minúscula, subject
abaixo de 72 caracteres.

```
feat(modules): declare fin, tasks and projects module boundary
fix(ai): read model ids from config and surface OCR failures
```

Tipos: `feat` `fix` `docs` `chore` `refactor` `test` `perf` `build` `ci` `style`.

Commits **atômicos e agrupados por assunto**. Se o diff mistura assuntos, divida.
Poucos commits coerentes valem mais que um commit por arquivo.

O corpo explica **por quê**, não o quê — o diff já mostra o quê. Quando o commit
corrige algo do `CONCERNS.md`, cite o identificador (`C0`, `C12`).

### Atribuição de IA — inegociável

**Nunca** inserir em mensagem de commit, título ou corpo de PR, comentário de
issue ou release note:

- `Co-Authored-By:` de qualquer ferramenta
- "Generated with …", assinatura de ferramenta, endereço de bot

O código é do time e a responsabilidade é de quem committa. O hook `commit-msg`
rejeita.

## Pull Requests

Sempre contra `main`, **squash merge**. O título vira o commit na `main`, então
segue o mesmo formato de commit.

- **Rebase, nunca merge** de `main` na branch: `git fetch origin && git rebase origin/main`
- Se o rebase reescreveu commits já enviados: `--force-with-lease`, nunca `--force`
- Um assunto por PR; referencie a issue
- Corpo: o que, por quê, como testar. Sem footer de ferramenta.

## Código

As convenções observadas estão em
[`specs/codebase/CONVENTIONS.md`](./specs/codebase/CONVENTIONS.md). As que mais
pegam quem chega:

- **Código em inglês; comentário e log em português.**
- **String de usuário sempre pelo i18n.** O catálogo é tipado — chave nova exige
  pt, en **e** es, senão não compila.
- **`process.env` só em `bot/src/infra/config.ts`.**
- **Dependência externa atrás de uma interface.** O domínio não conhece o fornecedor.
- **Comando novo de módulo** entra no `module.ts` do módulo, não em `core/commands.ts`.
- O bot é **CommonJS**; import relativo **sem** a extensão `.js`. O `web/` é ESM.

## Testes

Teste anda **na mesma task** do código — não existe "task de escrever os testes"
no fim. O que cada camada exige está em
[`specs/codebase/TESTING.md`](./specs/codebase/TESTING.md).

Fixture é **sintética**. Cupom real tem dado pessoal e nunca é versionado.

## Dependências

Dependência nova precisa de justificativa no PR. Antes de adicionar, verifique se
o que você quer já existe no projeto.

## Documentação

`docs/` é o sistema como ele é; `specs/` é o plano. Decisão estrutural vira ADR em
`docs/adr/`; decisão menor vira uma linha em `docs/decisions.md`. Ao terminar uma
feature, o `ROADMAP.md` e o `STATE.md` são atualizados — isso faz parte da feature.
