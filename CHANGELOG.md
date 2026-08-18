# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Este arquivo começa em 2026-08-17; o que veio antes está no histórico do git e
resumido em [`specs/project/ROADMAP.md`](./specs/project/ROADMAP.md).

O projeto ainda **não foi para produção** e não tem versão publicada.

## [Não lançado]

### Segurança

- **O estado de conversa saiu da memória do processo.** Compra aguardando "sim/não",
  e-mail aguardando código e token de vínculo vivem numa coleção do Mongo com índice
  de TTL — então a pergunta pode sair de uma réplica e a resposta chegar noutra, e
  reiniciar deixou de perder o que estava pendente. O rate limit ficou em memória por
  ser o mais quente, com o teto dividido por `REPLICAS`. (C2)
- **Os jobs periódicos passaram a rodar sob lock.** Com mais de uma réplica, os dois
  `setInterval` acordavam juntos: o usuário receberia o mesmo lembrete N vezes, e a
  purga de retenção — que **apaga contas** — rodaria concorrente consigo mesma. Agora
  só quem ganha a disputa executa, e o lock vence sozinho se a instância morrer no
  meio do ciclo. (C3)

- **O `AuthServer` estava aberto.** `POST /auth/email/start` disparava e-mail real
  pelo WorkOS sem limite nenhum — dava para queimar a cota, usar o Alfred para
  spammar terceiros e enumerar quem tem conta. Agora há rate limit por IP antes do
  roteamento, com balde e janela próprios para `/auth/email/*` (5 por 15 min contra
  60 por minuto), resposta 429 com `Retry-After`, e `x-forwarded-for` só é lido com
  `TRUST_PROXY=true`. (C6)
- **Origem passou a ser obrigatória em produção.** `WEB_ALLOWED_ORIGIN` e
  `WEB_APP_URL` caíam em `*` quando não definidas — o default falhava **aberto**, e
  esquecer a variável liberava o chat e a API para qualquer site. Com
  `NODE_ENV=production`, ausência (ou `*` explícito) derruba o startup. (C7)

### Corrigido

- **A camada de IA estava quebrada há dois meses.** O `gemini-2.0-flash-lite-001`
  — default para texto **e** para leitura de cupom, hardcoded em dois arquivos —
  foi desligado no Vertex AI em 2026-06-01. O fallback cruzado caía num
  `gpt-4-turbo` que se aposenta em 2026-10-23, então nenhuma mensagem era
  processada. Modelo, região e modelo de visão passam a vir de configuração
  (`GEMINI_MODEL`, `GEMINI_LOCATION`, `GEMINI_VISION_MODEL`, `OPENAI_MODEL`), com
  default em `gemini-3.1-flash-lite`. (C0, C13)
- **Falha de OCR virava "texto do cupom".** Os providers devolviam a string
  `"Erro ao processar a imagem."`, que seguia para o modelo como se fosse o
  conteúdo lido — o usuário via "não entendi" em vez de "o OCR falhou". Agora
  lançam `OcrError`. (C12)
- **`pnpm lint` falhava em qualquer máquina que já tivesse buildado.** No flat
  config do ESLint, `ignores` dentro de um bloco com `files` não vale como ignore
  global; o lint entrava em `dist/` e `coverage/`. O CI não pegava porque o
  checkout é limpo.

### Adicionado

- **Tradução dos adapters coberta a 100 %.** Telegram e WhatsApp estavam em 0 %, e é
  ali que mora o footgun de cada plataforma. A tradução saiu para
  `platforms/<canal>/translate.ts` — sem dependência de SDK, porque o Baileys é ESM
  puro e o Jest do projeto é CommonJS, o que tornava o arquivo intestável. 38 casos
  de fixture sintética. (C5)

- **Fronteira de módulos.** `bot/src/modules/` declara `fin` (implementado),
  `tarefas` e `projetos` (declarados). O contrato `ModuleDefinition` espelha o do
  `yas-harness` para que a migração futura seja mecânica. Comando de módulo não
  construído responde "ainda não disponível" em vez de ser ignorado em silêncio.
- **Catraca de cobertura** (`coverageThreshold`) nos valores atuais — a cobertura
  já havia caído em silêncio antes.
- **`./scripts/check.sh`** e `pnpm check` por projeto, espelhando o CI.
- **Documentação que não existia:** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, este changelog, `docs/` (arquitetura, decisões, 6 ADRs, runbook)
  e `specs/` (mapeamento do código, visão, roadmap, estado).

### Alterado

- **O `BotCore` deixou de ser um god object.** De 1042 para **336 linhas**, 68 % a
  menos. O fluxo de compra virou `modules/fin/PurchaseFlow.ts`; os 17 comandos
  viraram objetos que se declaram, resolvidos por um registro — **não existe mais
  `switch` de comando**. Sobrou o chassi: normalizar, rate limit, resolver usuário e
  despachar. Sem mudança de comportamento — 259 testes verdes, nenhum reescrito para
  acomodar o refactor. (C4)

- **O Alfred deixou de ser um bot de finanças** e passou a ser um assistente
  pessoal com capacidades em módulos. (ADR-0004)
- **O catálogo de comandos deriva do registro de módulos**, em vez de uma
  constante que o adapter do Telegram repetia à mão.
- `ROADMAP.md` saiu da raiz para `specs/project/`; o guia de uso foi para
  `docs/runbooks/`. Links quebrados no `README.md` e no `bot/README.md`
  corrigidos.
