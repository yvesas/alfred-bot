# Plano de estruturação do Alfred

**Escrito em:** 2026-08-14
**Fontes estudadas:** `docs_yaslab/` (21 docs de visão) · `yas-harness-project/`
(o chassi) · `audova/audova-app` (o irmão mais maduro) · `claude-base/` (o template)
**Status:** **decidido e parcialmente executado em 2026-08-14.**
O Alfred passa a ser um assistente pessoal modular ([ADR-0004](../../docs/adr/0004-alfred-modular.md))
e o caminho escolhido é o **C — híbrido** ([ADR-0005](../../docs/adr/0005-caminho-hibrido-harness.md)).
Da Fase 3, os passos 3.2, 3.3 e 3.4 estão feitos. Ver [`STATE.md`](STATE.md).

---

## 0. A descoberta que reordena o plano

Eu ia escrever a spec da frente **F1** (camada de IA: gateway de modelos
configurável + roteador de intenção em modelo barato). Antes de escrever,
li o `yas-harness`.

**Ele já tem as duas coisas, prontas e testadas.**

| O que eu ia construir no Alfred | O que o harness já tem |
|---|---|
| Modelo/preço/região saindo do código para config | `config/models.json` — models, tiers, **preços**, ordem de fallback (ADR-0002, `yas-harness/docs/adr/0002`) |
| Roteador de intenção em modelo barato | `src/router/` — triagem no tier `routing`, com `confidence` e `reason` (ADR-0003, `yas-harness/docs/adr/0003`) |
| Provider Groq atrás de `IMessageProcessor` | `config/models.example.json` **já traz o Groq** como provider `fast` (`api.groq.com/openai/v1`) |
| Fallback quando o modelo falha | `RoutedGateway` — retry com backoff só em falha transitória, depois o próximo candidato |
| Medir custo por chamada | tabela `model_usage`, uma linha por tentativa, dinheiro em `numeric` |
| Eval do roteador | `src/router/eval.ts` — case set versionado + runner de acurácia |

O ADR-0002 diz, com todas as letras, a mesma coisa que eu tinha escrito como
diagnóstico do C13:

> *"Model ids, prices and preference order are the fastest-moving facts in this
> system. A price change or a new model should be a reviewed config edit, not a
> code change and a release."*

E o `01-visao-yaslabs-suite.md` já tinha decidido:

> *"**Reusar, não reconstruir.** Auth, billing, IA: infraestrutura compartilhada
> desde o segundo produto."*

Construir o F1 dentro do `alfred-bot` seria reconstruir o chassi. **O plano
mudou por causa disso.**

---

## 1. O que cada fonte me disse

### `docs_yaslab/` — a ideia central

A tese é **vários mini-SaaS independentes que viram uma suite**, com uma IA
central costurando tudo. Três coisas dali mudam como o Alfred deve ser tratado:

**O Alfred é a plataforma, não um bot.** O doc 10 é explícito: micros são o
Audova e o Tutor; **o Alfred nasce modular** — Fin + Secretário + Calendário —
com duas camadas (pessoal como porta de entrada, Business onde está a
disposição a pagar).

**O que existe hoje é o módulo Fin.** O `alfred-bot` é o "Alfred Financeiro" do
catálogo (doc 02), que diz: *"Concluir como financeiro e renomear... O nome
'Alfred' fica reservado para o secretário geral."*

**"Alfred" é codinome.** Existe um `HeyAlfred` (`heyalfredapp.com`) ocupando o
nome no mesmo espaço. O nome comercial é decisão pendente (doc 03).

**A ordem oficial de execução é outra.** Doc 10: Tutor → Audova vendável →
Alfred → CRM/Projetos. E a regra de contenção do perfil D alto: *"Uma peça por
vez até o lançamento. Não abrir frente nova antes de uma peça estar no ar e
cobrando."* Voltar ao Alfred agora contraria a própria ordem escrita — é sua
decisão mudá-la, mas ela precisa ser tomada de olhos abertos.

### `yas-harness` — o chassi

Maduro e consumível, não é protótipo:

- Fases 0–6 completas, épicos E3 (BYOM) e E5 (compressão), MCP inteiro,
  console com 5 fases. **~835 testes**, CI verde.
- **Empacotado**: `main`/`exports`/`files`/`bin`, e um `package:check` que
  empacota, instala num projeto descartável e importa **pelo nome**.
- Apache 2.0, governança completa.
- Traz muito além do F1: cofre de credenciais (AES-256-GCM), OAuth com refresh
  transparente, **10 conectores reais**, cache read-through, aprovação humana,
  memória com embeddings, pools multi-tenant, telemetria de custo, compressão
  de contexto, servidor MCP.
- Estado (2026-08-11): falta a F7.2d e a tag; a memória tem esquema e chave
  provados mas **ainda não foi indexada de verdade**.

A regra de ouro dele: *"se um trecho de código não serviria igual num tutor de
línguas e num CRM, ele NÃO pertence ao harness."* Domínio vive nos módulos dos
produtos.

### `audova/audova-app` — o irmão mais maduro

O que vale copiar:

| Padrão | Como está no Audova | Como está no Alfred |
|---|---|---|
| Provider atrás de interface **desde o dia 1** | `SttProvider`, `LlmProvider` — *"Never call an LLM SDK outside `packages/llm/providers/*`"* | ✅ já faz (`IOcrProvider`, `IMessageProcessor`) |
| `CLAUDE.md` com **"Stack (decided — do not re-litigate)"** | corta rediscussão de stack em toda sessão | parcial — tenho "Regras específicas deste repo" |
| `AGENTS.md` na raiz | ✅ | ❌ **falta** |
| `docs/` narrativo numerado (00-visão … 13-observabilidade) | fonte da **intenção** do produto | equivalente: `specs/project/PROJECT.md` |
| Regras de arquitetura **não-negociáveis** numeradas | 6 regras, cada uma com o porquê | ❌ falta |
| Monorepo `apps/` + `packages/` | separa app de biblioteca reusável | `bot/` + `web/` + `ocr-service/`, sem `packages/` |

O que **não** vale copiar: o Audova **não adotou o claude-base**. Tem
`.claude/rules/` próprias, hooks em `.mjs` e nenhum `specs/`. É o padrão
anterior. O Alfred já está no padrão novo — não regredir.

### `claude-base` — o template

Aqui há um mal-entendido a desfazer: **o claude-base não é um template de
estrutura de produto.** Ele é a fonte única das *convenções* — `.claude/`
(settings, hooks, rules, commands, skills) e `.githooks/`.

A "estrutura de projeto" que ele prescreve está numa regra dele,
`docs-e-specs.md`: `docs/` (o sistema como é) + `specs/` (o plano). **Isso já
foi feito hoje** — `docs/{architecture,decisions,adr/,runbooks/}` e
`specs/{codebase,project,features}` estão no lugar.

Então "estruturar o Alfred no template do claude-base" tem **três** partes, e
só uma é sobre arquivos:

1. ✅ **Feito hoje** — a estrutura `docs/` + `specs/`
2. ⬜ **Falta pouco** — baseline v0.5.0 → v0.5.1, `AGENTS.md`, pasta-projeto
3. ⬜ **A decisão real** — o Alfred reconstrói o chassi ou usa o harness?

---

## 2. A tensão, dita sem rodeio

**O `alfred-bot` é um harness artesanal.** Olhe o que ele tem e o que isso é:

| No `alfred-bot` | O que realmente é | No `yas-harness` |
|---|---|---|
| `BotCore` roteando por `switch` de 17 casos | roteador | `src/router/` com eval |
| `IMessageProcessor` + fallback gemini↔gpt | gateway de modelos | `src/models/RoutedGateway` |
| `OutboundRegistry` + adapters | camada de canal | `src/connections/` |
| `RateLimiter` em memória | política de uso | telemetria + pools |
| — | aprovação humana | `src/approval/` |
| — | custo por chamada | `model_usage` |
| — | trace do turno | `src/telemetry/` |
| — | multi-tenant | `tenant_id` com constraint |
| `Purchase`, NFC-e, orçamentos, categorias | **domínio Fin** ✅ | não existe — e não deve |

A última linha é a boa notícia: **o valor real do `alfred-bot` é o domínio**, e
o domínio é exatamente o que o harness *não* faz e *não* deve fazer. 177 testes,
LGPD fases 1-2, multi-plataforma, leitura de NFC-e com DV mód-11 e dedup — nada
disso se joga fora. Vira o **módulo Fin**.

O que se joga fora é o chassi caseiro. E é justo o chassi caseiro que está
quebrado (C0: os dois modelos hardcoded estão mortos ou morrendo).

---

## 3. O plano

### Fase 1 — Estrutura e higiene *(sem decisão pendente; ~1 sessão)*

Tudo aqui é barato, reversível e independente da Fase 2.

**1.1 — `alfred/` vira pasta-projeto no padrão `yas-harness-project/`**

Hoje `alfred/` tem o repo e duas fotos de cupom soltas (`nota-01.jpg`,
`nota-02.jpg` — **cupons reais, com dado pessoal**, já cobertos pelo
`.gitignore` do repo mas fora dele). O harness resolveu isso assim: repo dentro,
planejamento e material de estudo fora.

```
alfred/
├── alfred-bot/          o repositório (vira alfred-fin/ na Fase 3, se for o caso)
├── samples/private/     nota-01.jpg, nota-02.jpg — fixtures reais, nunca versionadas
└── estudos/             referências (HeyAlfred, Caddy, Cal.com) — como o harness faz
```

**1.2 — Atualizar o baseline** — o repo está em v0.5.0, o `claude-base` em
v0.5.1. `claude-base/bin/install alfred/alfred-bot --check` primeiro.

**1.3 — `AGENTS.md` na raiz** — Audova e harness têm; o Alfred não. Curto:
aponta para o `CLAUDE.md` e repete as duas regras inegociáveis.

**1.4 — Regras de arquitetura não-negociáveis no `CLAUDE.md`**, no estilo do
Audova — numeradas, cada uma com o porquê. As candidatas já estão descobertas:
domínio não conhece fornecedor; adapter não contém regra de conversa; string de
usuário sempre pelo i18n; `process.env` só em `config.ts`.

**1.5 — README de fronteira por pasta em `bot/src/`** — o harness faz isso e
funciona: cada pasta declara o que é dela e o que não é. É o antídoto barato
para o `BotCore` ter virado um god object de 1042 linhas.

**1.6 — Um comando de gate** — `npm run check` espelhando o CI, como no harness.
Hoje são quatro comandos decorados em dois projetos.

**1.7 — Registrar o `yas-harness-project` no `CLAUDE.md` do workspace** — ele
não está na tabela de projetos, e mora **fora** de `yaslabs/`. Quem chega não
acha o chassi.

### Fase 2 — A decisão *(bloqueia a Fase 3)*

Escrever o **ADR-0004: o Alfred é um produto sobre o `yas-harness`?**

Três caminhos honestos:

| | Caminho | O que custa | O que dá |
|---|---|---|---|
| **A** | **Bot autônomo.** Conserta o C0 na unha e segue independente. | Baixo agora. Reconstruir roteador, gateway, custo e aprovação depois — ou nunca ter. | Volta a funcionar em dias. Contraria "reusar, não reconstruir". |
| **B** | **Migrar já** para o harness; o domínio Fin vira módulo. | Alto. O harness pede Postgres+pgvector; o Alfred é Mongo. Migração de dados + de chassi ao mesmo tempo. | O Alfred nasce plataforma, com custo, trace, aprovação e conectores de graça. |
| **C** | **Híbrido** *(recomendado)*. Conserta o C0 mínimo agora, decide a migração por escrito agora, executa depois. | Médio, distribuído. | O bot volta a funcionar em dias; nenhum trabalho jogado fora; a fronteira fica marcada. |

**Recomendo o C**, por três razões concretas:

1. **O C0 não espera.** Os modelos estão mortos; nenhum caminho arquitetural
   conserta isso mais rápido que trocar dois ids e levá-los para a config.
2. **Migrar de chassi e de banco junto é a receita do desastre.** Mongo→Postgres
   e `BotCore`→harness são dois projetos; empilhá-los esconde qual dos dois
   quebrou.
3. **A ordem oficial ainda diz Tutor primeiro.** O C permite destravar o Alfred
   sem abrir a frente grande antes da hora — respeitando a regra de contenção do
   doc 10.

O que o C implica de imediato, e é o mais importante: **as etapas 2 e 3 da
frente F1 morrem.** Não construir roteador nem provider Groq dentro do
`alfred-bot`. Isso é do harness.

### Fase 3 — Execução do caminho escolhido

**Se for o C (recomendado):**

| # | O quê | Gate |
|---|---|---|
| 3.1 | Confirmar o C0: `gcloud ai models list --region=us-central1 \| grep flash-lite` | você roda |
| 3.2 | Modelo, região e provider saem do código para `infra/config.ts` (resolve C13) | testes verdes |
| 3.3 | Apontar para modelos vivos; erro de modelo indisponível **falha alto**, não vira "não entendi" (resolve C12) | teste que falha quando o provider recusa |
| 3.4 | Marcar a fronteira no código: o que é domínio Fin fica, o que é chassi ganha um README dizendo "isto sai quando migrarmos" | `/check-boundary`, como no harness |
| 3.5 | Rate limit em `/auth/email/start` (C6) e origem explícita em produção (C7) | testes de integração |
| 3.6 | **B1 — rotacionar a chave GCP** | você, no console |

**Depois disso, e só depois**, a frente F2 (UX de conversa) — com o `BotCore`
já quebrado em handlers, porque mexer em UX com ele inteiro é caro (C4).

**Se for o B**, o plano é outro e maior: `alfred-fin` como módulo do harness,
migração Mongo→Postgres, e os adapters de Telegram/WhatsApp virando canais.
Escrevo esse plano separado se você escolher o B.

---

## 4. O que não entra neste plano

| Item | Por quê |
|---|---|
| Nome comercial do Alfred | Decisão de produto (doc 03), não de estrutura |
| Renomear o repo para `alfred-fin` | Só faz sentido junto com a Fase 3 do caminho B/C |
| Módulos Secretário e Calendário | Doc 10 é claro: não inchar o v1 |
| Cobrança (Stripe) | Depende de o bot funcionar primeiro |
| Adotar `packages/` como o Audova | Só se houver código a compartilhar entre `bot/` e `web/`; hoje não há |
| Numerar `docs/` como o Audova | O claude-base prescreve nomes semânticos; o Audova é o padrão anterior |

---

## 5. Perguntas em aberto

1. **Caminho A, B ou C?** É a única coisa que bloqueia.
2. A ordem do doc 10 (Tutor primeiro) continua valendo, ou o Alfred passou na
   frente? Se passou, vale atualizar o doc 10 — senão a próxima sessão vai
   reabrir a discussão.
3. O `yas-harness` entra no Alfred como **dependência npm** (`yas-harness` já
   está empacotado) ou por **fork**, como o doc 14 dizia originalmente?
4. Mongo continua, ou o Alfred vai para Postgres+pgvector como o harness?
