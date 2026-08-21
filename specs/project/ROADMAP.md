# Roadmap

**Atualizado em:** 2026-08-14
Legenda: ✅ feito · 🟡 parcial · ⬜ a fazer · 🔴 risco aberto

> Este arquivo substitui o `ROADMAP.md` que ficava na raiz. Os documentos que ele
> citava (`ANALISE-PROJETO.md`, `PLANO-MULTIPLATAFORMA.md`, `PLANO-WEB-CHAT.md`,
> `PLANO-FASE6.md`, `PLANO-EVOLUCAO.md`, `PLANO-OCR-FASES.md`,
> `PLANO-PADDLEOCR-DOCKER.md`) **nunca foram commitados** — a decisão de cada um
> está resumida aqui e o que virou estrutura virou ADR em `docs/adr/`.

---

## O plano, por fases — revisto em 2026-08-20

**Cada fase é base da seguinte.** A ordem não é por valor percebido: é por
dependência. Fase que não destrava outra fica fora da sequência, no fim.

_Legenda: ✅ feito · 🔨 em andamento · ⬜ a fazer · 🔴 bloqueia tudo abaixo_

| # | Fase | Por que aqui | Estado |
|---|---|---|---|
| **0** | [Colocar no ar](#fase-0--colocar-no-ar-) | Nada abaixo alcança um usuário sem isto | 🔴 |
| **1** | [Módulo tarefas](#fase-1--módulo-tarefas) | Segundo módulo; dá à proatividade o que vigiar | ✅ **2026-08-21** |
| **2** | [Proatividade](#fase-2--proatividade-) | O diferencial. Precisa de mais de um módulo para valer | ✅ **2026-08-21** |
| **3** | [UX de conversa e voz](#fase-3--ux-de-conversa-e-voz) | O que a pessoa sente primeiro | ⬜ |
| **4** | [Módulo projetos](#fase-4--módulo-projetos) | O cruzamento fin × tarefas que justifica ser um assistente só | ⬜ |
| **5** | [Web de gestão](#fase-5--web-de-gestão) | Só tem o que mostrar depois dos três módulos | ⬜ |
| **6** | [Second brain — fatia fina](#fase-6--second-brain--fatia-fina-) | A IA que responde sobre o que já existe | ⬜ |
| **7** | [Cobrança](#fase-7--cobrança) | Só faz sentido com algo que valha pagar | ⬜ |
| **8** | [WhatsApp oficial](#fase-8--whatsapp-oficial) | Tira o risco de banimento; não destrava nada | ⬜ |
| **9** | [Second brain — profundidade](#fase-9--second-brain--profundidade) | É aqui que vira diferencial vendável | ⬜ |

**Fora da sequência**, quando houver motivo: LGPD fase 3 (jurídico), NFC-e fase 2
(itens via SEFAZ), dashboards do Grafana, e os blocos B/C/D do
[`PLANO-TECNICO.md`](PLANO-TECNICO.md).

### A lição que definiu esta ordem

O Niklas reordenou o roadmap dele em agosto e escreveu o porquê:

> *"A ordem anterior colocava o second brain na 3 e o WhatsApp na 8; a ordem atual
> constrói primeiro aquilo que o escritório usa todo dia — captação, boards, caso,
> chat — e só então a IA que responde sobre isso."*

**Vale igual aqui.** Um second brain sobre um módulo só não tem o que cruzar, e
proatividade sobre um módulo só é o `ReminderScheduler` que já existe. Por isso
tarefas vem antes de proatividade, e projetos antes do second brain.

> **Não renumere sem registrar aqui o porquê.** Esta ordem substituiu a de
> 2026-08-14, que colocava proatividade em primeiro — antes de haver o que vigiar.

---

### Fase 0 — Colocar no ar 🔴

**Nada abaixo alcança um usuário enquanto isto não fechar.** O Alfred nunca foi para
produção, e o conserto do C0 nunca foi confirmado contra o Vertex de verdade.

| | Item | De quem |
|---|---|---|
| ⬜ | **Confirmar o C0** — `gcloud ai models list --region=us-central1 \| grep flash-lite` | você |
| ⬜ | **Rotacionar a chave do GCP** (`C1`) — aberta desde o começo | você |
| ⬜ | Mergear os PRs [#8](https://github.com/yvesas/alfred-bot/pull/8) e [#9](https://github.com/yvesas/alfred-bot/pull/9) | você |
| ⬜ | **Escolher o host** (`BL-3`) — Railway · Fly.io · Render · Cloud Run · VPS | você |
| ⬜ | CD por tag, com `CHANGELOG` mergeado antes | — |
| ⬜ | Primeiro deploy, com `REPLICAS` e origens explícitas configuradas | — |
| ⬜ | Rodar o `migrateCanonical` e **confirmar que não sobrou usuário sem `identities[]`** | — |

O último item destrava o `C17` — sem essa confirmação, remover o `$or` desloga gente.

**Pronto quando:** uma pessoa que não é você registra um gasto pelo Telegram e ele
aparece no painel.

---

### Fase 1 — Módulo tarefas ✅ *(concluída em 2026-08-21)*

Está declarado desde o ADR-0004 e responde *"ainda não disponível"*. É o segundo
módulo, e o mais barato: `/lembretes` já é uma tarefa com data e entrega por push.

- ✅ Modelo `Task` chaveado pelo `User._id` canônico, com prazo opcional
- ✅ `/tarefas` com `add [DD/MM]`, `ok`, `remover` — no registro de comandos
- ✅ Exclusão de conta apaga as tarefas (LGPD), no mesmo commit em que o módulo nasce
- ✅ `findDue` pronto para a Fase 2
- ⬜ **Criar tarefa por conversa** — depende do roteador de intenção (Fase 3)
- ⬜ Destino de `/lembretes`: convive com tarefas de propósito; se convergirem, vira ADR

**O que apareceu:** o Mongo ordena documento **sem** o campo antes dos que têm, então
um `sort({ dueDate: 1 })` ingênuo poria as tarefas sem prazo no topo — o oposto do
pretendido. Um teste pegou. A listagem passou a ser duas consultas.

---

### Fase 2 — Proatividade ⭐ ✅ *(concluída em 2026-08-21)*

**O diferencial.** É o que o Caddy vende — *"tells you what needs your attention
right now"* — e o que separa um assistente de um formulário com IA.

A infraestrutura existe: o `OutboundRegistry` entrega push nas três plataformas, e o
`JobLockService` garante que só uma réplica dispara.

**O que falta é o que decide o que merece ser dito.** E, mais difícil, **o limite de
quando calar** — assistente que fala demais é desinstalado.

- ✅ Regras explícitas, não IA: tarefa vencida ou vencendo hoje, orçamento no teto
- ✅ Um aviso por ciclo, teto diário de 2, janela de horário, nunca repetir
- ✅ Métrica de resposta: escrever até 30 min depois conta como o aviso ter servido
- ✅ Sob lock, como os outros jobs — com réplica, N ciclos avisariam N vezes
- ⬜ **Preferência por usuário** — hoje o horário é global e do fuso do servidor. O
      que resolve de verdade é fuso por usuário, e o Alfred nem pergunta
- ⬜ Desligar pelo chat — só por variável de ambiente, o que serve ao operador, não
      ao usuário

**Vem desligado** (`PROACTIVE_ENABLED=false`): ligar mexe com a paciência de quem
recebe. Detalhe em [`bot/src/core/proactive/README.md`](../../bot/src/core/proactive/README.md).

---

### Fase 3 — UX de conversa e voz

19 comandos de sintaxe posicional (`/editar 3 total 45,90`) é interface de CLI num
app de chat. Comando é bom **como atalho**, não como caminho principal.

- ⬜ Botões inline e teclado contextual no Telegram
- ⬜ Confirmar e editar por toque, em vez de sintaxe
- ⬜ **Entrada por voz** — o Caddy aceita áudio; o Alfred não
- ⬜ `/ajuda` gerado a partir do registro de módulos

O refactor do `C4` foi feito justamente para isto: um comando é um objeto, então o
botão se pendura nele.

---

### Fase 4 — Módulo projetos

Trabalhos que agrupam tarefas — e custo. **O cruzamento é a razão de o Alfred ser um
assistente só, e não três apps.** "Quanto este projeto já me custou" só existe aqui.

- ⬜ Modelo `Project`, tarefas ligadas a ele
- ⬜ Compra opcionalmente ligada a projeto
- ⬜ A pergunta que justifica a fase: custo acumulado por projeto

---

### Fase 5 — Web de gestão

O web hoje é chat mais um painel de leitura. Falta o CRUD que um sistema de gestão
tem — e só agora há três módulos para mostrar.

- ⬜ Layout de aplicação: navegação lateral, tabela com filtro e paginação
- ⬜ Uma tela por módulo
- ⬜ Os endpoints REST que faltam no `AuthServer`
- ⬜ **Decidir:** o `AuthServer` em `node:http` puro continua, ou vira framework?
- ⬜ Botão "sair de todos os dispositivos" — o endpoint já existe desde o `C8`

---

### Fase 6 — Second brain — fatia fina ⭐

A IA que responde sobre o que já existe. **É do Alfred, não do chassi**
([ADR-0006](../../docs/adr/0006-inteligencia-e-second-brain-sao-do-alfred.md)).

Fatia fina, no modelo do Niklas: **poucas fontes, honesto ponta a ponta**, com
citação da fonte. Melhor responder pouco e certo do que muito e sem lastro.

- ⬜ Indexar o que já existe: compras, tarefas, projetos
- ⬜ Pergunta em linguagem natural com **citação de origem**
- ⬜ Busca vetorial no Atlas — o Mongo fica ([ADR-0007](../../docs/adr/0007-relacao-com-o-yas-harness.md))
- ⬜ Atrás de interface própria, mock antes de implementação

---

### Fase 7 — Cobrança

`User.plan` e o limite do free já existem; falta a forma de assinar. Stripe já está
configurado no portfólio.

- ⬜ Checkout e assinatura do Pro
- ⬜ Webhook de status, com o plano refletido no `User`
- ⬜ Portal de cobrança do cliente

---

### Fase 8 — WhatsApp oficial

Hoje é Baileys: engenharia reversa, login por QR, número sujeito a banimento — e
**quatro das seis vulnerabilidades altas do `C22` vêm dele**.

- ⬜ Adapter da Cloud API oficial, ao lado do atual
- ⬜ Migrar e aposentar o Baileys

---

### Fase 9 — Second brain — profundidade

Cruzar fontes numa resposta só, extração estruturada, avaliação de qualidade. **É
aqui que vira diferencial vendável.**

---

## Feito

### Produto

| O quê | Detalhe |
|---|---|
| ✅ Onboarding | identifica por id da plataforma, nome do perfil, e-mail opcional (`/pular`), telefone por botão |
| ✅ Compra por texto | linguagem natural interpretada por IA |
| ✅ Compra por foto | multimodal (Gemini) por padrão; OCR → texto como alternativa |
| ✅ Confirmação antes de salvar | resumo + sim/não, flag `CONFIRM_PURCHASE`, cross-plataforma (A1) |
| ✅ Consulta de gastos | por período e por categoria/loja, via texto ou `/gastos` |
| ✅ Histórico paginado | `/compras [página]`, 5 por página, numeração absoluta |
| ✅ Editar e excluir | `/editar`, `/excluir`, escopados ao usuário (A2) |
| ✅ Categorias personalizadas | `/categorias`; a IA classifica pelas do usuário (A3) |
| ✅ Orçamento e alertas | `/orcamento`; alerta a 80 % e ao estourar, na categoria da compra |
| ✅ Lembretes | `/lembretes add <dia> <descrição>` + push nas três plataformas |
| ✅ Multi-idioma | `User.language` + `/idioma`; catálogo tipado pt/en/es no bot e no front (A4) |
| ✅ Exportação | CSV no servidor (`/exportar` e `/api/export.csv`) + PDF client-side no painel |
| ✅ Estoque | `/estoque` listar/add/remover |
| ✅ Escolha de modelo | `/ia gpt` ou `/ia gemini`, persistido em `User.aiModel` |
| 🟡 NFC-e | chave de acesso via IA + fallback `jsQR`, DV mód-11, CNPJ/UF/data derivados, dedup por cupom. **Falta:** itens completos via SEFAZ |

### Plataforma

| O quê | Detalhe |
|---|---|
| ✅ Multi-plataforma fases 1-3 | `BotCore` + adapters; Telegram; identidade `User.identities[]`; WhatsApp via Baileys |
| ✅ Chat web fases 1-6 | `WebAdapter` (WS), front React, login próprio e-mail+OTP (WorkOS Magic Auth), identidade canônica e vínculo cross-plataforma |
| ✅ Painel web | landing `/` · chat `/chat` · painel `/painel` · conta `/conta` · privacidade `/privacidade` |
| ✅ Push | `OutboundRegistry` + `sendTo` nos três adapters |
| ✅ LGPD fases 1-2 | consentimento versionado, `/excluir_conta` e exclusão web, edição de perfil, retenção de sessões anônimas, política publicada |
| 🟡 Planos e limites | `User.plan`, limite mensal no free com CTA, planos na landing. **Falta a cobrança** |

### Técnico

| O quê | Detalhe |
|---|---|
| ✅ Logger estruturado | pino; zero `console.*` |
| ✅ Config central validada | `infra/config.ts` + `assertRequiredConfig` |
| ✅ DI | Inversify; clients criados uma vez |
| ✅ Rate limit por usuário | janela deslizante em memória |
| ✅ Graceful shutdown e reconexão | `SIGINT`/`SIGTERM`; erro de DB aborta o processo |
| ✅ Health e métricas | `/health`, `/ready`, `/metrics` + perfil `monitoring` no compose |
| ✅ OCR trocável | `IOcrProvider` com Vision, Gemini e Paddle |
| ✅ Agregações no Mongo | `$facet` no lugar de somatório em memória |
| ✅ Testes | bot 189 (35 suítes), web 21; Mongo em memória nos repositórios; integração HTTP |
| ✅ CI | `bot.yml`, `web.yml`, `ocr-service.yml` path-filtered; Codecov; cache do binário do Mongo. **O do bot esteve vermelho de junho a agosto/2026 sem ninguém ver** — ver C23 |
| ✅ Husky | pre-commit (lint-staged + typecheck) e pre-push (testes) nos dois projetos |
| ✅ Docker | Dockerfile multi-stage por projeto + compose com perfis |

---

## Aberto, fora das fases

O que não destrava fase nenhuma. Fica aqui para não sumir — não para virar fila.

| O quê | Quando |
|---|---|
| **LGPD fase 3** — DPO, ROPA, DPIA | jurídico, não código; antes de cobrar de verdade |
| **NFC-e fase 2** — itens completos via SEFAZ | se a leitura por IA não bastar |
| **Dashboards do Grafana** | `/metrics` já expõe; falta o painel. Depois do deploy |
| **E2E foto → IA → persistência** | quando houver ambiente para rodar |
| **Cobertura do front** (Painel, Conta, Landing) | avulso |
| **`C22` — vulnerabilidades altas em produção** | 4 fechadas em 2026-08-20 pelo Dependabot; as 2 restantes saem com a Fase 8 |
| **`C24` — SDK do Vertex passou da data de remoção** | preventivo enquanto o Vertex responder; urgente se parar. Mesmo modo de falha do `C0` |
| Blocos B, C e D do [`PLANO-TECNICO.md`](PLANO-TECNICO.md) | cada um com o gatilho escrito lá |

### Bugs históricos

`B1` (rotacionar a chave do GCP) é o único aberto, e está na **Fase 0**.
`B2`–`B7` foram resolvidos entre fevereiro e junho de 2026.

Os riscos técnicos vivem em [`CONCERNS.md`](../codebase/CONCERNS.md) — dos 23
catalogados, 14 estão fechados.

---

## Como usar este documento

**Uma fase por vez, até o fim.** É a regra de contenção do
[`PROJECT.md`](PROJECT.md), e ela existe porque o risco deste projeto não é falta de
ideia — é dispersão.

Ao terminar uma fase: marque aqui, atualize o [`STATE.md`](STATE.md) e o
[`HANDOFF.md`](HANDOFF.md), e registre em ADR o que virou estrutura. O ritual completo
está no [`PLANO-TECNICO.md`](PLANO-TECNICO.md) §0 — vale igual para o produto.

Fase grande vira `specs/features/NNNN-slug/` com spec, design e tasks, na numeração
sequencial de quatro dígitos. Fase pequena dispensa.
