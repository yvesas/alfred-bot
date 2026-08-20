# Política de segurança

O Alfred guarda dados financeiros e pessoais de quem o usa. Vulnerabilidade aqui
não é bug — é vazamento.

## Reportar uma vulnerabilidade

**Não abra issue pública.** Use o
[Security Advisory privado](https://github.com/yvesas/alfred-bot/security/advisories/new)
do GitHub, ou escreva para o contato de privacidade configurado em
`PRIVACY_CONTACT_EMAIL`.

Inclua: o que acontece, como reproduzir, e o impacto que você enxerga. Resposta em
até 5 dias úteis.

## O que é tratado como vulnerabilidade

- Acesso a dados de outro usuário (compras, lembretes, perfil)
- Contornar autenticação, ou aceitar um JWT que deveria ser inválido
- Injeção que alcance o banco, o shell ou a chamada ao modelo
- Vazamento de credencial em log, resposta de erro ou payload
- Uso do bot para spam a terceiros (ex.: disparar e-mail em massa)

## Postura de segredo

- Segredo vive em variável de ambiente ou secret manager. **Nunca** no código, em
  log, em teste ou em fixture.
- `.env*` é gitignorado. `.env.sample` versiona **só o nome** das variáveis.
- `bot/src/config/google-credentials.json` é uma chave real de service account,
  gitignorada e montada read-only no compose. **Nunca** commite esse arquivo.
- Log é estruturado e **sem PII** — sem CPF, e-mail, nome ou dado de saúde.
- Credencial de terceiro guardada pelo sistema é criptografada.

Se um segredo vazar para o histórico: **rotacione primeiro**. Reescrever o
histórico não invalida a chave. Depois limpe o histórico e avise quem tem clone.

## Fraquezas conhecidas

Este projeto **nunca foi para produção**. As fraquezas abaixo estão catalogadas em
[`specs/codebase/CONCERNS.md`](./specs/codebase/CONCERNS.md), com caminho de
correção, e precisam ser fechadas antes de qualquer uso real:

| # | O quê |
|---|---|
| **C1** | Credencial GCP real em disco, nunca rotacionada |
| **C6** | Sem rate limit em `POST /auth/email/start` — dá para queimar cota e spammar terceiros |
| **C7** | `WEB_ALLOWED_ORIGIN` e CORS com default `*` — falham **abertos**, não fechados |
| **C8** | JWT de 30 dias sem revogação; `logout` só limpa o `localStorage` |

Divulgar essas quatro aqui é deliberado: estão no repositório, não em produção, e
esconder fraqueza conhecida de quem for rodar o projeto seria pior.

## Escopo

Vale para `bot/`, `web/` e `ocr-service/` na branch `main`. Dependência de
terceiro: reporte ao projeto de origem e nos avise para atualizarmos.
