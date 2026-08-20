# Roadmap

**Atualizado em:** 2026-08-14
Legenda: ✅ feito · 🟡 parcial · ⬜ a fazer · 🔴 risco aberto

> Este arquivo substitui o `ROADMAP.md` que ficava na raiz. Os documentos que ele
> citava (`ANALISE-PROJETO.md`, `PLANO-MULTIPLATAFORMA.md`, `PLANO-WEB-CHAT.md`,
> `PLANO-FASE6.md`, `PLANO-EVOLUCAO.md`, `PLANO-OCR-FASES.md`,
> `PLANO-PADDLEOCR-DOCKER.md`) **nunca foram commitados** — a decisão de cada um
> está resumida aqui e o que virou estrutura virou ADR em `docs/adr/`.

---

## Próximo ciclo — revisto em 2026-08-14

**O produto mudou de tamanho.** O Alfred deixou de ser um bot de finanças e passou
a ser um assistente pessoal com capacidades em módulos — **fin**, **tarefas**,
**projetos**. Ver [ADR-0004](../../docs/adr/0004-alfred-modular.md).

E o chassi tem destino: o `yas-harness`, que já traz roteador em modelo barato,
gateway de modelos por configuração e custo por chamada. Caminho **híbrido** —
consertar aqui, migrar depois. Ver [ADR-0005](../../docs/adr/0005-caminho-hibrido-harness.md)
e [`PLANO-ESTRUTURACAO.md`](PLANO-ESTRUTURACAO.md).

> **Regra de contenção:** `tasks` e `projects` estão **declarados, não em
> construção**. Construir largura antes de o `fin` funcionar seria o erro clássico.

### F1 — Camada de IA ✅ *(o que sobrou dela, feito em 2026-08-14)*

Era reparo, não otimização: o `gemini-2.0-flash-lite-001` — default para texto
**e** cupom, hardcoded em dois arquivos — foi desligado no Vertex AI em
**2026-06-01**, o mesmo mês em que o trabalho parou. O fallback do B7 caía num
`gpt-4-turbo` que morre em **2026-10-23**.

- ✅ Modelo, região e visão saem do código para `infra/config.ts` (fecha o C13)
- ✅ Default aponta para `gemini-3.1-flash-lite`; teste trava a lição — nenhum
  modelo já aposentado volta a ser default em silêncio
- ✅ Falha de OCR sobe como `OcrError` em vez de virar texto do cupom (fecha o C12)
- ❌ **Roteador de intenção — removido do escopo do Alfred.** É do chassi.
- ❌ **Provider Groq — removido do escopo do Alfred.** O harness já o tem
  configurado como provider `fast`.

> Falta você confirmar o desligamento com
> `gcloud ai models list --region=us-central1 | grep flash-lite`.

### F2 — Proatividade 🔴 *a próxima frente*

**Por quê:** é o que separa um assistente de um formulário com IA — e é o que o
Caddy vende como produto: *"keeps an eye on your calendars, chats, and tasks, then
tells you what needs your attention right now."* Hoje o Alfred só fala quando falam
com ele; a única exceção é o `ReminderScheduler`.

**O que já existe:** o `OutboundRegistry` entrega push nas três plataformas. A
infraestrutura está pronta.

**O que falta:** o que **decide o que merece ser dito** — e o limite de quando
calar. Um assistente que fala demais é desinstalado.

**Depende de:** nada técnico. Depende de decisão de produto.

### F3 — UX de conversa além dos comandos

**Por quê:** 19 comandos com sintaxe posicional (`/editar 3 total 45,90`) é
interface de CLI num app de chat. Comando é bom **como atalho**, não como caminho
principal.
**Escopo:** botões inline e teclado contextual do Telegram, confirmação e edição
por toque, entrada por **voz** (o Caddy aceita áudio; o Alfred não).
**Depende de:** quebrar o `BotCore` antes (C4) — mexer em UX com 1042 linhas é caro.

### F4 — Web de gestão com dashboards

**Por quê:** o web hoje é chat + painel de leitura. Falta o CRUD que um sistema de
gestão tem.
**Escopo:** layout de aplicação, tabela com filtro e paginação, telas por módulo,
e os endpoints REST que faltam no `AuthServer`.
**Depende de:** decidir se o `AuthServer` em `node:http` puro continua ou vira
framework — e de os módulos existirem, senão as telas não têm o que mostrar.

### Módulos declarados, a construir

| Módulo | Pré-requisito | Semente que já existe |
|---|---|---|
| **tarefas** | `fin` funcionando + F2 | `/lembretes` já é tarefa com data e push |
| **projetos** | `tarefas` | — |

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

## Aberto

### Bugs

| # | O quê | Estado |
|---|---|---|
| B1 | **Rotacionar a chave GCP** (`google-credentials.json` real em disco) | 🔴 **aberto — ação sua**, não é código |
| B2–B7 | conexão de DB, shutdown, data de lançamento, preferência de modelo, parser rígido, fallback de IA | ✅ resolvidos |

Os riscos técnicos abertos hoje estão catalogados em
[`specs/codebase/CONCERNS.md`](../codebase/CONCERNS.md) — 23 itens, com C1-C3 em
crítico. Os que bloqueiam produção: **C2** (estado em memória) e **C3**
(schedulers duplicados) impedem rodar com mais de uma réplica.

### Produto e negócio

- ⬜ **Cobrança (Stripe)** — checkout e assinatura do Pro. É o que falta para o
  produto poder cobrar.
- ⬜ **WhatsApp Cloud API oficial** (multi-plataforma fases 4-5) — hoje é Baileys,
  engenharia reversa, com risco de banimento do número.
- ⬜ **LGPD fase 3** — DPO, ROPA, DPIA. Jurídico, não código.
- ⬜ **NFC-e fase 2** — itens completos via SEFAZ.

### Operação

- ⬜ **Definir host e CD** — Railway / Fly.io / Render / Cloud Run / VPS. Nunca
  decidido; é pré-requisito de tudo que é "produção".
- 🟡 **Observabilidade** — `/metrics` exposto, **nenhum dashboard no Grafana**.

### Qualidade

- ⬜ **E2E foto → IA → persistência**
- ⬜ **Cobertura do front** (Painel/Conta/Landing com API mockada)
- ⬜ **Testes dos adapters Telegram e WhatsApp** (hoje 0 %) — C5
- ⬜ **`CONTRIBUTING.md`** — o hook `commit-msg` já manda o usuário lê-lo
- ⬜ **Gate de cobertura** (`coverageThreshold`) — C18

---

## Ordem sugerida

1. **Confirmar o C0** — um comando `gcloud`, e é seu. Tudo abaixo assume o bot vivo.
2. **B1 — rotacionar a chave do GCP.** Não entra em fila; é independente de tudo.
3. **F2 (proatividade)** — é o que separa o Alfred de um formulário com IA, e não
   depende de refactor nenhum.
4. **Quebrar o `BotCore`** (C4) — barato agora, caríssimo depois do F3.
5. **F3 (UX de conversa + voz)** — o que o usuário sente primeiro.
6. **Migrar para o `yas-harness`** (ADR-0005) — quando o fin estiver de pé.
7. **Construir `tasks`**, depois `projects`.
8. **Cobrança + deploy** — quando houver o que cobrar. Antes, resolver C2 e C3.
