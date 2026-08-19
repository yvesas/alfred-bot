# Pontos de atenção

**Analisado:** 2026-08-14 · Só o que tem evidência no código. Cada item traz o
arquivo e um caminho de correção. Ordenado por risco.

---

## 🔴 Crítico

### ~~C0~~ — Os dois modelos de IA hardcoded estão mortos ou morrendo · ✅ **resolvido em 2026-08-14**

**Onde:** `services/GeminiProcessor.ts:21` e `services/ocr/GeminiOcrProvider.ts:19`
(`gemini-2.0-flash-lite-001`) · `services/GptProcessor.ts:16` (`gpt-4-turbo`)

**Evidência:**

| Modelo | Status | Fonte |
|---|---|---|
| `gemini-2.0-flash-lite-001` | **desligado em 2026-06-01** no Vertex AI (serving e Provisioned Throughput) | fontes secundárias concordantes; **não confirmado numa página do próprio Google** — a doc é JS-pesada e não rendeu a tabela |
| `gpt-4-turbo` | desligamento em **2026-10-23** (~2 meses) | **confirmado** na página oficial de deprecations da OpenAI |

**Risco:** o Gemini é o **default** do bot — tanto para extrair compra de texto
quanto para ler cupom (`OCR_PROVIDER=gemini`, `OCR_MODE=multimodal`). Se o
desligamento se confirmou, **toda chamada de IA falha**. E o fallback cruzado do
B7 (gemini↔gpt) **não salva**: cai num `gpt-4-turbo` que morre em outubro. O
usuário receberia sempre `ai_error`.

Cronologia que reforça a suspeita: o último trabalho de feature foi em
**junho/2026** — o mesmo mês do desligamento. É plausível que o bot tenha parado
de funcionar sem ninguém ver.

**Confirmar assim** (rode você, precisa da sua credencial):

```bash
gcloud ai models list --region=us-central1 | grep -i flash-lite
```

**✅ Resolvido em 2026-08-14.** Modelo, região e modelo de visão saem do código para
`infra/config.ts` (`GEMINI_MODEL`, `GEMINI_LOCATION`, `GEMINI_VISION_MODEL`,
`OPENAI_MODEL`). Defaults apontam para `gemini-3.1-flash-lite` — disponível,
mais barato e mais rápido que o 2.5 — e `gpt-5.6-terra`.
`tests/aiModelConfig.test.ts` trava a lição: guarda a lista de modelos já
aposentados e falha se algum voltar a ser default. Próxima aposentadoria é
variável de ambiente, não deploy.

**Pendente de você:** confirmar o desligamento com
`gcloud ai models list --region=us-central1 | grep -i flash-lite`. Se o
`gemini-2.5-flash-lite` ainda servir e for preferível por custo, é só definir
`GEMINI_MODEL` — mas ele morre em 2026-10-20.

### C1 — Credencial GCP real em disco, nunca rotacionada

**Onde:** `bot/src/config/google-credentials.json`
**Evidência:** o arquivo existe localmente e é o caminho padrão de autenticação
do Gemini/Vertex (`GOOGLE_APPLICATION_CREDENTIALS`). Está gitignorado
(`bot/.gitignore:6`), não é rastreado pelo git e o compose o monta read-only —
verificado. Mas é o `B1` aberto desde o começo do ROADMAP.
**Risco:** chave de service account viva numa máquina de desenvolvimento.
**Correção:** **rotacionar a chave no GCP** (ação sua — o agente não faz), e em
produção usar Workload Identity ou o Secret Manager em vez de arquivo.

### ~~C2~~ — Estado crítico só em memória impede mais de uma instância · ✅ **resolvido em 2026-08-18**

**Onde:** `BotCore.pendingPurchases` e `pendingEmailVerification`
(`core/BotCore.ts:67,69`) · `LinkTokenService` (memória, TTL 10 min) ·
`RateLimiter` (janela por instância — o próprio comentário admite:
*"para escalar horizontalmente, migrar para Redis"*).
**Risco:** com duas réplicas atrás de um balanceador, a confirmação "sim" cai numa
instância que não tem a compra pendente; o token de vínculo do deep-link não é
encontrado; o rate limit vale N× o configurado. **Um reinício também perde tudo.**
**✅ Resolvido em 2026-08-18 — Mongo, não Redis.** Três dos quatro foram para
`ConversationStateStore` (coleção `conversationstates`, índice único em `(kind, key)`
e índice de TTL). Decidido assim porque o host ainda não foi escolhido, e adotar
Redis agora seria escolher um host que tenha Redis. A troca depois é por classe.

**O quarto — o `RateLimiter` — ficou em memória de propósito.** Ele dispara em toda
mensagem e toda requisição; ida ao banco a cada uma custaria mais do que o problema
vale. O preço é que cada réplica tem a própria janela, então o teto é dividido por
`REPLICAS`, para N instâncias somarem o limite em vez de multiplicá-lo. A aproximação
só é exata com distribuição uniforme — preferimos barrar cedo a deixar passar N vezes.

**Duas coisas que o trabalho revelou:**

1. **Toda leitura filtra por `expiresAt`.** O varredor de TTL do Mongo roda a cada
   ~60 s, então um documento vencido continua legível por até um minuto. O índice
   serve para limpar, não para responder — sem o filtro, um token expirado ainda
   seria aceito nessa janela.
2. **A garantia depende do índice existir.** O Mongoose constrói índice de forma
   assíncrona, e `autoIndex` costuma vir desligado em produção. Sem o índice único, o
   lock do C3 não tranca e o `put` duplica. Descoberto por um teste que falhava uma
   vez a cada três; hoje `JobLockService` e `ConversationStateStore` esperam
   `Model.init()` uma vez antes da primeira escrita.

**TTL escolhido:** compra pendente 1 h, e-mail 15 min (acompanha o código do WorkOS),
token de vínculo 10 min. Antes não havia TTL nenhum — o Map durava o processo. Todos
configuráveis.

### ~~C3~~ — Schedulers rodam em toda instância · ✅ **resolvido em 2026-08-18**

**Onde:** `services/ReminderScheduler.ts:22` · `services/RetentionScheduler.ts:15`
**Evidência:** `setInterval` no processo, sem lock nem eleição de líder.
**Risco:** N réplicas = N pushes do mesmo lembrete para o usuário. E o
`RetentionScheduler` apaga contas — concorrência ali é pior que ruído.
**✅ Resolvido em 2026-08-18.** `JobLockService` + coleção `joblocks`: os dois ciclos
rodam dentro de `runExclusively`, e só quem ganha a disputa executa.

A exclusão mútua vem de **uma** operação atômica — um `findOneAndUpdate` com upsert
cujo filtro só casa com lock livre ou vencido. Não existe janela entre ler e escrever
porque não existe leitura separada; quem perde recebe `E11000` e pula o ciclo. O lock
**vence sozinho** (`lockedUntil`), então instância que morre no meio do ciclo não
deixa o job preso, e é devolvido no `finally` — inclusive quando o ciclo lança.

Mora no Mongo de propósito: lock de job é uma linha no banco que já existe, e não
depende da decisão pendente sobre onde guardar estado de conversa (C2).

**Descoberto ao fazer:** os dois schedulers **não tinham teste nenhum**. Agora têm —
inclusive um que sobe MongoDB de verdade e prova que, com cinco instâncias disputando
ao mesmo tempo, exatamente uma vence. Mock não provaria isso: a garantia é do banco.

---

## 🟠 Alto

### ~~C4~~ — `BotCore` é um god object de 1042 linhas · ✅ **resolvido em 2026-08-18**

**Onde:** `core/BotCore.ts`
**Evidência:** 15 dependências injetadas no construtor, ~25 handlers privados,
`handleCommand` com `switch` de 17 casos. Cobertura de **58,13 %** — a menor de
todo o bot, justo no arquivo com mais regra.
**Risco:** conflito em qualquer mudança de UX, teste caro, e a próxima feature de
conversa (agente/IA conversacional) cai exatamente aqui.
**✅ Resolvido em 2026-08-18 — 1042 → 336 linhas (68 % a menos).**

| Saiu para | O quê |
|---|---|
| `modules/fin/PurchaseFlow.ts` | roteamento da resposta da IA, confirmação, gravação, alerta de orçamento, consulta de gastos |
| `modules/fin/commands.ts` | os 9 comandos de domínio |
| `core/chassisCommands.ts` | os 8 comandos de conta, identidade e preferências |
| `core/commandRegistry.ts` | o despacho — **não existe mais `switch` de comando** |
| `core/AccountLinking.ts` · `core/PendingEmailStore.ts` | vínculo e e-mail pendente, que eram método e campo privados compartilhados por handlers distantes |

**Sem mudança de comportamento, e a suíte é a prova:** nenhum teste foi reescrito
para acomodar o refactor. Os que mudaram foram os que testavam implementação (o
`RateLimiter` cutucava um campo privado) ou os que ficaram factualmente errados
(uma asserção afirmava que o chassi *não* estava no registro — depois do passo 3,
está).

**Um comando novo agora se declara**, e o registro recusa nome com dois donos na
carga do módulo. O `BotCore` não sabe o que nenhum comando faz.

### ~~C5~~ — Adapters do Telegram e do WhatsApp sem nenhum teste · ✅ **resolvido em 2026-08-18**

**Onde:** `platforms/telegram/`, `platforms/whatsapp/` — não aparecem no relatório
de cobertura (0 %); só o `WebAdapter` tem suíte.
**Risco:** a normalização `SDK → IncomingMessage` é onde mora o footgun de cada
plataforma (foto em várias resoluções, contato de terceiro, JID de grupo,
reconexão). Quebra ali é silenciosa até um usuário reclamar.
**✅ Resolvido em 2026-08-18.** A tradução saiu de dentro dos adapters para
`platforms/<canal>/translate.ts` — módulos que **não importam SDK nenhum** — e está
em **100 %** de cobertura nos dois canais, com 38 casos de fixture sintética.

**Por que a extração era necessária, e não só arrumação:** o Baileys é ESM puro e o
Jest deste projeto é CommonJS, então qualquer arquivo que o importasse era
*intestável*. Não era desleixo que mantinha o WhatsApp em 0 % — era um bloqueio
real. O Telegram foi extraído junto, por simetria e para não repetir o problema se
o Telegraf mudar.

**O que os testes pegam:** foto em várias resoluções (a miniatura é ilegível para o
OCR), contato de terceiro (viraria `verifiedPhone` de quem não é), texto do WhatsApp
que chega em `conversation` **ou** em `extendedTextMessage` (ler só um perde
resposta, citação e link com preview), e o descarte de grupo/status/mensagem própria
— sem o qual o bot responderia a si mesmo.

**Ressalva:** o que está coberto é a **tradução**. O ciclo de vida dos adapters
(conexão, reconexão, QR, download de mídia) continua sem teste — depende de SDK e de
rede, e não cabe em teste unitário.

### ~~C6~~ — Sem rate limit nos endpoints HTTP · ✅ **resolvido em 2026-08-17**

**Onde:** `infra/authServer.ts` — o `RateLimiter` só é chamado pelo `BotCore`
(`handleText`/`handlePhoto`).
**Risco:** `POST /auth/email/start` dispara e-mail do WorkOS **sem limite**: dá
para queimar cota, spammar terceiros e enumerar contas. `/api/*` também aceita
força bruta de JWT sem freio.
**✅ Resolvido em 2026-08-17.** O `RateLimiter` ganhou limite por chamada
(`allow(key, limit)`) e é aplicado por IP na entrada do `handle()`, **antes do
roteamento** — vale inclusive para rota inexistente, que é o que uma varredura usa.
`/auth/email/*` tem balde e janela próprios (5 por 15 min contra 60 por min).
Resposta 429 com `Retry-After` e corpo genérico, que não revela qual limite caiu
nem se o e-mail existe. `x-forwarded-for` só é lido com `TRUST_PROXY=true`, senão
o cliente forja o próprio IP. O limiter passou a podar chaves vencidas: com chave
de IP a cardinalidade é ilimitada. Coberto em `authServerRateLimit.test.ts`.

### ~~C7~~ — Defaults permissivos de origem (`*`) · ✅ **resolvido em 2026-08-17**

**Onde:** `infra/config.ts:42` (`webAllowedOrigin: ... || "*"`) e
`infra/authServer.ts:170` (`Access-Control-Allow-Origin: config.webAppUrl || "*"`)
**Risco:** esquecer `WEB_ALLOWED_ORIGIN`/`WEB_APP_URL` em produção abre o
WebSocket e a API para qualquer site. O default falha **aberto**, não fechado.
**✅ Resolvido em 2026-08-17.** `assertProductionOrigins()` roda dentro de
`assertRequiredConfig()`: com `NODE_ENV=production`, `WEB_ALLOWED_ORIGIN` e
`WEB_APP_URL` ausentes **ou iguais a `"*"`** derrubam o startup com a lista do que
falta. Fora de produção segue permissivo. Coberto em `productionOrigins.test.ts`.

### ~~C8~~ — JWT de 30 dias sem revogação · ✅ **resolvido em 2026-08-19**

**Onde:** `services/AuthService.ts:54` (`expiresIn: "30d"`) ·
`web/src/lib/auth.ts:19` (guardado em `localStorage`)
**Risco:** token vazado (XSS, máquina compartilhada) vale um mês; `logout()` só
apaga o `localStorage` — o servidor continua aceitando o token.
**✅ Resolvido em 2026-08-19 — versionando a sessão.** `User.tokenVersion` entra em
todo JWT emitido; incrementá-lo derruba de uma vez todos os tokens já emitidos, sem
precisar rastreá-los. `POST /api/sessions/revoke` faz isso a pedido do titular, e
derruba inclusive a sessão de quem chamou — que é o certo para quem suspeita de
vazamento.

**Assinatura válida deixou de bastar.** A conferência acontece nos dois lugares onde
um token dá acesso: `authedUser` na API (que já carregava o usuário, então não custou
consulta nova) e `AuthService.resolveCurrentSession` no chat web — sem este segundo,
um token revogado continuaria conversando pelos 30 dias inteiros.

**Token antigo não é derrubado por engano:** os emitidos antes desta mudança não têm
`v`, e ausente conta como zero. Eles expiram sozinhos em vez de deslogar a base
inteira de uma vez.

**Fica pendente (produto, não segurança):** o botão "sair de todos os dispositivos"
no app web. O endpoint existe; a tela não o chama ainda — o `logout` atual continua
sendo só deste dispositivo, que é o que a pessoa espera dele.

### C22 — Dívida de dependência: 6 vulnerabilidades altas em produção

**Descoberto em 2026-08-19**, pelo próprio workflow de auditoria adicionado no mesmo
PR — o gate funcionou na primeira execução e encontrou dívida pré-existente.

| Projeto | Advisory | Caminho |
|---|---|---|
| bot | `form-data` — CRLF injection | `baileys → axios → form-data` |
| bot | `form-data` — CRLF injection | `@google-cloud/vision → google-gax → form-data` |
| bot | `axios` — adapter HTTP herda proxy do ambiente | `baileys → axios` |
| bot | `sharp` — vulnerabilidades herdadas da libvips | `baileys → sharp` |
| web | React Router — DoS não autenticado | `react-router-dom → react-router` |
| web | React Router — bypass de CSRF no modo RSC | `react-router-dom → react-router` |

Mais 13 moderadas no bot e 5 no web. Contando as de desenvolvimento, 29 e 30.

**Risco real, não teórico.** O `sharp` chega pelo Baileys e é usado no processamento
de imagem — o bot recebe foto de cupom de qualquer pessoa. As duas do React Router
afetam o app web publicado.

**Quatro das seis são transitivas do Baileys**, que já é a dependência mais frágil do
projeto (biblioteca de engenharia reversa, sem contrato de suporte). Isso reforça a
troca pela Cloud API oficial, que está no `ROADMAP.md`.

**Por que o gate não barra nisto.** O workflow bloqueia em **crítico de produção**;
altas ficam informativas. Barrar todo PR por dívida pré-existente puniria trabalho
não relacionado e o gate viraria ruído que ninguém lê. As altas são acompanhadas pelo
Dependabot (ligado no mesmo PR, com updates agrupados por semana).

**Correção:** deixar o Dependabot propor, e revisar os PRs dele. O que ele não
resolver sozinho depende do fornecedor — `sharp` e `axios` só saem quando o Baileys
atualizar, ou quando o WhatsApp migrar para a Cloud API.

---

## 🟡 Médio

### C9 — `/editar` e `/excluir` carregam o histórico inteiro

**Onde:** `core/BotCore.ts:536` — `nthRecentPurchase` chama
`purchaseService.getUserPurchases(userId)` (sem `limit`) e pega `all[n-1]`.
**Risco:** usuário com milhares de compras traz tudo do Mongo para a RAM a cada
comando. Cresce sem teto.
**Correção:** `findByUserPaged(userId, n-1, 1)` — o repositório já tem o método.

### C10 — Três agregações por compra registrada

**Onde:** `PlanService.canRegister` → `getSpendingReport` ·
`BudgetService.alertsForPurchase` → `getSpendingReport` · e o relatório em si.
**Evidência:** cada `$facet` monta totais + por loja + por categoria; o
`canRegister` usa **só o `count`**.
**Correção:** `countByUser` com filtro de período para o plano (query barata), e
reaproveitar um único `SpendingReport` entre o gate de plano e o alerta de
orçamento na mesma requisição.

### C11 — GPT não lê imagem, e o usuário não é avisado

**Onde:** `services/GptProcessor.ts` não implementa `processImage`;
`MessageProcessingService.processImage` devolve `null` e o fluxo cai no
OCR → texto (`BotCore.extractFromImage:245`).
**Risco:** quem roda `/ia gpt` passa a ter leitura de cupom pior, silenciosamente
— e paga o OCR à parte. `gpt-4-turbo` **suporta** visão; é lacuna de implementação.
**Correção:** implementar `processImage` no `GptProcessor` (`image_url` com data
URI), ou avisar no `/ia`.

### ~~C12~~ — Erro de OCR vira "texto do cupom" · ✅ **resolvido em 2026-08-14**

**Onde:** os três providers devolvem a string `"Erro ao processar a imagem."`
no `catch` (`GeminiOcrProvider.ts:41`, `PaddleOcrProvider.ts:34`,
`VisionOcrProvider.ts:38`).
**Risco:** essa string é entregue à IA como se fosse o conteúdo do cupom. O
usuário recebe "não entendi" em vez de "o OCR falhou", e a métrica
`ai_errors_total` não conta.
**✅ Resolvido em 2026-08-14.** Os três providers lançam `OcrError` (novo, em
`utils/errors.ts`, carregando qual provider falhou). O `BotCore.handlePhoto` já
tinha o `try/catch` com `t(lang, "photo_error")` — agora ele recebe a falha em vez
de a IA receber a mensagem de erro como se fosse o cupom. Coberto em
`GeminiOcrProvider.test.ts` e `PaddleOcrProvider.test.ts`.

### ~~C13~~ — Modelos de IA hardcoded em três arquivos · ✅ **resolvido em 2026-08-14**

**Onde:** `GeminiProcessor.ts:21` e `GeminiOcrProvider.ts:19`
(`gemini-2.0-flash-lite-001`, região `us-central1`) · `GptProcessor.ts:16`
(`gpt-4-turbo`).
**Risco:** trocar de modelo (ou testar um mais barato/rápido) exige mexer em
código e redeploy. Bloqueia experimentação de custo.
**✅ Resolvido em 2026-08-14**, junto com o C0. Ver a nota lá.

### C14 — Entrada externa validada à mão, sem schema

**Onde:** `WebAdapter.toIncoming` (`typeof payload?.clientId === "string"`),
`authServer.readJson` + checagens manuais, `validateAndConvertModelResponse`
(cadeia de `if` com `any`).
**Evidência:** a regra do workspace (`code-style.md`) pede schema (Zod/similar) em
toda entrada externa; o projeto não tem nenhum validador.
**Correção:** um schema Zod por borda (payload do WS, corpo de cada rota, resposta
da IA), reaproveitado como tipo — elimina o `any` do converter de quebra.

### C15 — Mensagem de erro fora do i18n

**Onde:** `infra/converters/purchaseConverter.ts:57-73` — `validatePurchaseData`
devolve `reason` em pt-BR cru, e `BotCore` responde `❌ ${validation.reason}`.
Também `TelegramAdapter.ts:144` ("Por favor, compartilhe o seu próprio contato").
**Risco:** usuário em `en`/`es` recebe português. O catálogo tipado existe
justamente para isso.
**Correção:** devolver `MessageKey` em vez de texto.

### C16 — `Purchase.userId` é `string` solta

**Onde:** `models/Purchase.ts:56` — `{ type: String, required: true }`, sem `ref`
nem `ObjectId`.
**Risco:** nada impede compra órfã; a exclusão de conta depende de
`deleteByUser` acertar a string; a migração canônica (Fase 6) precisou de um
script (`scripts/migrateCanonical.ts`, sem teste).
**Correção:** migrar para `ObjectId` com `ref: "User"` — mudança de schema, exige
plano de migração; registrar como ADR se for adiada de novo.

### C17 — `telegramId` legado ainda em toda query

**Onde:** `models/User.ts:64` e `UserRepository.findByIdentity`/`updateByIdentity`,
que fazem `$or: [byIdentity, { telegramId }]` **só** para Telegram.
**Risco:** dois caminhos de resolução de identidade convivendo; o `$or` inutiliza
parcialmente o índice composto.
**Correção:** rodar o `migrateCanonical` em produção, confirmar que não sobrou
usuário sem `identities[]`, e remover o campo e o `$or`.

### ~~C18~~ — Sem gate de cobertura · ✅ **resolvido em 2026-08-17**

**Onde:** `bot/jest.config.cjs` (sem `coverageThreshold`); `.github/workflows/bot.yml`
só envia ao Codecov.
**Risco:** cobertura cai sem quebrar nada. Já caiu — o `BotCore` está em 58 %.
**✅ Resolvido em 2026-08-17.** `coverageThreshold` global em `bot/jest.config.cjs`,
nos valores de hoje arredondados para baixo (statements 75, branches 60, functions 74,
lines 75). Catraca, não meta.

---

## 🔵 Baixo / manutenção

### C19 — Ruído de `dynamic import` no teste do QR

`src/tests/QrService.test.ts` faz o Jest despejar um stack trace com
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` — o `jimp` usa import dinâmico e o
ts-jest está em CommonJS. **O teste passa**, mas o log sujo esconde falha real.
Correção: mockar o `jimp` na suíte ou rodar com `--experimental-vm-modules`.

### C20 — `ocr-service` sem teste e sem imagem construída

`.github/workflows/ocr-service.yml` existe, mas o serviço não tem suíte e a
imagem nunca foi buildada (paddlepaddle não tem wheel para linux/arm64; em Mac
ARM exige `--platform linux/amd64`). Está funcional só no papel.

### ~~C21~~ — `CONTRIBUTING.md` citado e inexistente · ✅ **resolvido em 2026-08-17**

O hook `commit-msg` manda "Ver CONTRIBUTING.md" quando rejeita. **✅ Criado em
2026-08-17**, junto com `AGENTS.md`, `SECURITY.md` e `CHANGELOG.md`.

### C22 — Guard de commit em dois lugares

`core.hooksPath` = `bot/.husky/_`; o guard ativo é `bot/.husky/commit-msg`
(verificado funcionando). O `.githooks/commit-msg` do baseline fica **inerte**.
Quem editar só o do baseline não muda nada.

### C23 — Contato de privacidade é placeholder

`infra/config.ts:56` — `PRIVACY_CONTACT_EMAIL` tem default
`privacidade@exemplo.com`. Publicado assim, a política de privacidade lista um
endereço que não existe.

---

## Lacunas de produto (não são defeitos, são o que falta)

| Lacuna | Estado | Onde |
|---|---|---|
| Cobrança (Stripe) | plano `pro` existe no schema e na UI, **sem forma de assinar** | `models/User.ts:81`, `PlanService` |
| Deploy / CD | nenhum host definido; Dockerfile e healthcheck prontos | `ROADMAP` |
| WhatsApp oficial (Cloud API) | hoje é Baileys — biblioteca de engenharia reversa, número pode ser banido | `platforms/whatsapp/` |
| NFC-e fase 2 (itens via SEFAZ) | só a chave e o dedup existem | `utils/fiscalKey.ts` |
| Dashboards do Grafana | `/metrics` exposto, nenhum painel criado | `monitoring/` |
| E2E foto → IA → banco | não existe | `specs/codebase/TESTING.md` |
| LGPD fase 3 (DPO/ROPA/DPIA) | jurídico, não código | — |
