# STATE — memória de trabalho

> Reescrito a cada sessão. Decisão que precisa sobreviver a uma reescrita vira
> ADR em [`docs/adr/`](../../docs/adr/).

**Última sessão:** 2026-08-18
**Branch:** `main` — os três PRs de fundação foram mergeados em 2026-08-20

---

## Onde o projeto está

O Alfred deixou de ser um bot de finanças e passou a ser um **assistente pessoal
com capacidades em módulos** — `fin` (implementado), `tarefas` e `projetos`
(declarados, não construídos). Ver [ADR-0004](../../docs/adr/0004-alfred-modular.md).

Suíte verde: bot **50 suítes / 404 testes** (cobertura 81,1 %), web 8 arquivos /
21 testes. Lint e typecheck limpos. `./scripts/check.sh` é o gate único.

**Fases 1, 2 e 3 concluídas** — ver [`PLANO-TECNICO.md`](PLANO-TECNICO.md).
O `BotCore` caiu de **1042 para 336 linhas** e não existe mais `switch` de comando.
**O [`PLANO-TECNICO.md`](PLANO-TECNICO.md) está concluído** — as quatro fases, doze
riscos fechados. O backlog restante virou a **Fase 5**, agrupada por natureza e
**sob demanda**: nada ali é urgente, e cada bloco traz o gatilho que o justifica.

Sobrou o `C1` (rotacionar a chave do GCP, ação sua). **O próximo trabalho de maior
valor é de produto**, não de endurecimento: a proatividade (F2 do
[`ROADMAP.md`](ROADMAP.md)).

**Nunca foi para produção**: sem host, sem CD, sem cobrança.

---

## Feito nesta sessão

**1. Mapeamento brownfield e estrutura de documentação**, que não existia:
`specs/codebase/` (7 arquivos), `specs/project/`, `docs/` com architecture,
decisions, ADRs e runbook, `CLAUDE.md`. O `ROADMAP.md` da raiz migrou para
`specs/project/`; links quebrados do `README.md` corrigidos.

**2. Estudo de quatro fontes** — `docs_yaslab/` (visão), `yas-harness` (o chassi),
`audova/audova-app` (o irmão mais maduro) e `claude-base` (o template). Resultado
em [`PLANO-ESTRUTURACAO.md`](PLANO-ESTRUTURACAO.md).

**3. C0 fechado — o bot estava quebrado.** O `gemini-2.0-flash-lite-001`, default
para texto **e** cupom e hardcoded em dois arquivos, foi desligado no Vertex AI em
**2026-06-01** — o mesmo mês em que o trabalho parou. Modelo, região e modelo de
visão foram para `infra/config.ts`; default agora é `gemini-3.1-flash-lite`;
`tests/aiModelConfig.test.ts` guarda a lista de aposentados e falha se algum
voltar a ser default. Fecha também o **C13**.

**4. C12 fechado.** Os três providers de OCR lançam `OcrError` em vez de devolver
`"Erro ao processar a imagem."` como se fosse texto do cupom.

**5. Fronteira módulo/chassi declarada e testada.** `bot/src/modules/` com o
contrato `ModuleDefinition` (espelha o do harness), registro dos três módulos e
`README.md` dizendo o que sai na migração. O catálogo de comandos passou a ser
derivado do registro — não existe mais lista paralela.

**6. Bug pré-existente do lint corrigido.** O `ignores` estava dentro do bloco com
`files` no flat config, então não valia como ignore global: `pnpm lint` entrava em
`dist/` e `coverage/` e falhava em qualquer máquina que já tivesse buildado. O CI
não pegava porque o checkout é limpo.

---

## Decisões desta sessão

- **D-DOC-001** — `specs/` é o plano, `docs/` é o sistema como é.
- **D-DOC-002** — Os `PLANO-*.md` perdidos não serão reconstruídos; o que virou
  estrutura virou ADR.
- **ADR-0004** — O Alfred é um assistente pessoal modular. Módulos: fin, tarefas,
  projetos. Declarar antes de mover.
- **ADR-0005** — Caminho híbrido com o `yas-harness`: consertar aqui, migrar
  depois. Gateway e triagem genérica saem do escopo do Alfred.
- **ADR-0006** — **A inteligência é do Alfred.** RAG, second brain, memória entre
  módulos e a escolha de modelo pelo usuário ficam aqui — não vão para o chassi,
  nem na migração. Corrige o ADR-0005, que tinha traçado a linha larga demais.
- **LICENSE proprietária** e CodeQL fora (não é gratuito em repo privado) — ver
  §8 do [`PLANO-TECNICO.md`](PLANO-TECNICO.md).

---

## Blockers

| # | O quê | De quem depende |
|---|---|---|
| BL-1 | **Rotacionar a chave GCP** (C1) — credencial real em disco desde o início | **Você.** O agente não tem acesso ao console |
| BL-2 | **Confirmar o desligamento do Gemini 2.0** — `gcloud ai models list --region=us-central1 \| grep -i flash-lite` | **Você.** O código já não depende disso, mas confirma o diagnóstico |
| BL-3 | Escolher o host (Railway / Fly.io / Render / Cloud Run / VPS) | Decisão sua — está na **Fase 0** do roadmap |
| ~~BL-4~~ | ~~Harness como dependência ou fork? Mongo ou Postgres?~~ | ✅ **fechado em 2026-08-20** — [ADR-0007](../../docs/adr/0007-relacao-com-o-yas-harness.md): copiar contratos, não depender; o Mongo fica |
| — | ~~Redis ou Mongo para o estado de conversa?~~ | ✅ decidido em 2026-08-18: Mongo |

---

## Pendências que viram trabalho

**A próxima frente é a proatividade (F2).** É o que separa um assistente de um
formulário com IA, e é o que o Caddy vende como produto. A infraestrutura existe
(`OutboundRegistry` entrega push nas três plataformas); falta **o que decide o que
merece ser dito** — e o limite de quando calar.

~~C2~~ e ~~C3~~ fechados: o bot já pode rodar com réplica. Defina `REPLICAS` com o
número de instâncias, senão o rate limit vale N× o configurado.

~~C6, C7~~ (2026-08-17) e ~~C5~~ (2026-08-18) fechados. O próximo trabalho técnico
está no [`PLANO-TECNICO.md`](PLANO-TECNICO.md): **Fase 3**, quebrar o `BotCore`
(C4) — que agora tem a rede que faltava.

---

## Ideias adiadas

- Migrar o domínio fin para `modules/fin/` — escopo escrito em
  `bot/src/modules/README.md`, data nenhuma. Declarar já pagou; mover é refactor
  grande e mecânico.
- `Purchase.userId` como `ObjectId` com `ref` (C16) — exige migração.
- Remover o campo legado `telegramId` e o `$or` das queries (C17).
- PaddleOCR self-hosted: a imagem nunca foi buildada (C20).

---

## Para retomar

**Comece pelo [`HANDOFF.md`](HANDOFF.md)** — religar o ambiente, o que está aberto e
as armadilhas que já morderam.

**O trabalho técnico tem plano próprio e vivo:**
[`PLANO-TECNICO.md`](PLANO-TECNICO.md) — fases, estado de cada etapa e o ritual
de atualização da documentação.

Leia, nesta ordem: [`PROJECT.md`](PROJECT.md) → [`ROADMAP.md`](ROADMAP.md) →
[`CONCERNS.md`](../codebase/CONCERNS.md). Para a decisão de arquitetura,
[`PLANO-ESTRUTURACAO.md`](PLANO-ESTRUTURACAO.md) e os ADRs 0004 e 0005.

Abra o Claude Code **dentro deste repositório**, não na pasta `yaslabs/`.
