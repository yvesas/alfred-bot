# Regra — Estilo de código

> Enforçada por: Prettier + ESLint (hook `format-lint` / lint-staged) e
> `tsc --noEmit` (hook `typecheck` no Stop + pre-push).

## Princípios

- **SOLID + Clean Code.** Função pequena, um motivo para mudar, nome que diz o
  que faz.
- **Dependência externa fica atrás de uma interface**, com implementação real e
  mock. O domínio não conhece o formato do fornecedor.
- **Payload despadronizado é normalizado na borda**, numa camada só. O resto do
  código vê o tipo do domínio.
- Reutilizar o que já existe antes de criar abstração nova. Padrão novo precisa
  de justificativa no PR — dependência nova, mais ainda.

## TypeScript

- `strict: true`. Nada de `any` solto; `unknown` + narrowing quando necessário.
- **Validar toda entrada externa com schema** (Zod, class-validator — o que o
  projeto usar). O que é validado e o que é publicado saem do mesmo schema, para
  não divergirem.
- Erro tipado. Nunca engolir exceção; nunca `catch {}` vazio.
- ESM nativo: import relativo carrega a extensão `.js`, quando o projeto for ESM.

## Antes de considerar pronto

- Lint limpo · `tsc --noEmit` sem erro · testes verdes.
- O hook `Stop` roda o typecheck nos projetos com árvore suja. Se ele reclamar,
  o trabalho não está pronto.
- Comentário explica **por quê**, não o quê. Código que precisa de comentário
  para dizer o quê deve ser reescrito.
