# Regra — Testes

> Enforçada por: CI e pelo gate de cada task (`Done when` no `tasks.md`).

## O contrato

- **Teste anda junto com o código, na mesma task.** Não existe "task de escrever
  os testes" no fim — se a task cria uma camada que exige teste, o teste faz
  parte do `Done when` dela.
- Todo teste que o projeto exige está declarado em `specs/codebase/TESTING.md`
  (tipo de teste por camada + comando do gate). Projeto novo: definir isso antes
  de quebrar a primeira feature em tasks.

## Padrões

- **Unit** cobre regra de negócio e caso de borda; roda sem rede e sem banco.
- **Integração** com dependência externa usa **mock server local + fixture**:
  valida URL, params, headers e o mapeamento cru → domínio sem tocar no sistema
  real.
- **Fixture sintética**, nunca payload real com dado de gente. Sample real vira
  fixture depois de sanitizado.
- **Teste "live"** contra sistema real fica gated por env var (`*_LIVE_TEST`),
  `describe.skip` no CI, rodado à mão com credencial.
- **e2e** cobre o caminho crítico do usuário, não tudo.

## Footguns

- Cobrir explicitamente as inconsistências conhecidas de API externa
  (camelCase × snake_case, campo opcional que às vezes vem `null`).
- Erro de negócio (404, 401) **não** abre circuit breaker; só falha técnica
  (timeout, 5xx).
- Se a suíte derruba o banco de dev (fixture que dá `drop_all`), isso vai
  documentado no `CLAUDE.md` do projeto **com a consequência escrita**, e o
  comando seguro vira o padrão.
