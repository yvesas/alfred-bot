# Instruções para agentes

Alfred é um **assistente pessoal no chat** com capacidades em módulos — `fin`
(implementado), `tarefas` e `projetos` (declarados, não construídos).

**Leia [`CLAUDE.md`](./CLAUDE.md) primeiro.** Ele tem os comandos, o gate e as
armadilhas deste repositório.

Quatro coisas que não se negociam:

1. **Sem atribuição de IA** em commit, PR ou comentário de issue: nada de
   `Co-Authored-By`, "Generated with" ou assinatura de ferramenta. O hook
   `commit-msg` rejeita, e `--no-verify` está negado no `settings.json`.
2. **Nunca leia nem escreva `bot/src/config/google-credentials.json`.** É uma
   chave real de service account.
3. **Não suba o Docker sem pedido explícito.** O compose monta essa credencial e
   sobe Mongo, bot e front.
4. **Módulo sabe domínio; chassi não sabe.** Ver
   [`bot/src/modules/README.md`](./bot/src/modules/README.md).

Antes de considerar pronto: `./scripts/check.sh` (ou `pnpm check` no projeto que
você tocou). Se não passa, não está pronto.

O plano vive em [`specs/`](./specs), o sistema como ele é vive em
[`docs/`](./docs). Antes de mexer em algo arriscado, leia
[`specs/codebase/CONCERNS.md`](./specs/codebase/CONCERNS.md).
