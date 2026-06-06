# Roadmap — bot-telegram

> Documento vivo. Reúne **o que já temos**, **o que desejamos**, **bugs conhecidos** e **melhorias**.
> Atualizado em 05/06/2026. Acompanha a análise técnica em [ANALISE-PROJETO.md](./ANALISE-PROJETO.md).

Legenda: ✅ feito · 🟡 parcial · ⬜ a fazer · 🔴 prioridade alta

---

## 1. Funcionalidades que temos ✅

| Funcionalidade | Estado | Observações |
|---|---|---|
| Cadastro/onboarding do usuário | ✅ | Identifica pelo ID do Telegram; nome capturado automaticamente do perfil; e-mail opcional (`/pular`); estado persistido no MongoDB |
| Captura opcional de telefone | ✅ | Botão "Compartilhar telefone" durante o cadastro |
| Saudação de usuário recorrente | ✅ | Reconhece pelo ID e cumprimenta pelo nome |
| Registro de compra por texto | ✅ | Linguagem natural interpretada por IA (Gemini/GPT) |
| Registro de compra por foto de cupom | ✅ | OCR (Google Vision) + IA |
| Consulta de gastos | ✅ | Por período (mês atual, mês passado, total) e por categoria/loja; via texto ou `/gastos` |
| Histórico paginado de compras | ✅ | `/compras` (5 por página) + `/compras <página>`; numeração absoluta usada por `/editar`/`/excluir` |
| Confirmar compra antes de salvar | ✅ | Resumo + "sim/não" (flag `CONFIRM_PURCHASE`); cross-plataforma (A1) |
| Editar e excluir compras | ✅ | `/editar <nº> <total\|descrição> <valor>` e `/excluir <nº>`, escopados ao usuário (A2) |
| Categorias personalizadas | ✅ | `/categorias` (listar/add/remover); a IA classifica conforme as do usuário (A3) |
| Orçamento mensal + alertas | ✅ | `/orcamento <categoria> <valor>`; alerta automático a 80% e ao estourar, na categoria da compra |
| Lembretes (push recorrente) | ✅ | `/lembretes add <dia> <descrição>`; agendador envia push no Telegram/WhatsApp/Web (contas a pagar) |
| Escolha do modelo de IA por usuário | ✅ | `/ia gpt` \| `/ia gemini` (Gemini é o padrão) |
| Persistência em MongoDB | ✅ | Mongoose (User, Purchase, Reminder) |
| Testes automatizados | ✅ | Bot: **153 testes** (~75% statements) — services, handlers do `BotCore`, **repositories (Mongo em memória)** e **API HTTP (integração)**. Web: **20 testes** (vitest + React Testing Library) — libs, componente e página |
| CI (GitHub Actions) | ✅ | Roda testes + cobertura (Codecov) em push/PR para `main`/`develop` |

---

## 2. Funcionalidades que desejamos ⬜

### Produto / usuário
- ✅ **Editar e excluir compras** (A2) — `/editar`, `/excluir`
- ✅ **Confirmar a compra antes de salvar** (A1) — resumo + "sim/não"
- ✅ **Orçamento mensal + alertas** — `/orcamento`; alerta a 80% e ao estourar
- ✅ **Histórico paginado** em `/compras` — `/compras <página>` (5 por página)
- ✅ **Categorias personalizadas** pelo usuário (A3) — `/categorias`
- ✅ **Lembretes** (contas a pagar / gasto recorrente) — `/lembretes` + push (Telegram/WhatsApp/Web)
- ✅ **Multi-idioma** (A4) — `User.language` + `/idioma`; IA responde no idioma; **todas** as strings fixas no catálogo i18n (pt/en/es) + i18n do front com seletor
- ✅ **Relatórios mais ricos**: painel web com resumo do mês, comparativo mês a mês (gráfico de barras) e quebra por categoria (`/api/report` + `ReportService`)
- ✅ **Exportação** de dados (CSV / PDF) — **CSV** no servidor (`/api/export.csv` + `/exportar` no chat envia o arquivo: Telegram/WhatsApp como documento, Web como download via WS) + **PDF** client-side (jsPDF) no Painel. `Replier.document` cross-plataforma
- 🟡 **Leitura de QR Code / NFC-e** — chave de acesso (44 díg) via IA + **fallback `jsQR`**; valida o DV (mód-11), deriva **CNPJ/UF/data** e **deduplica o cupom** (`Purchase.fiscalKey`). **Falta (Fase 2, opcional):** itens completos via API/SEFAZ
- ✅ **Gestão de produtos/estoque** — `/estoque` (listar, `add <qtd> <nome>`, `remover <nome>`); `ProductService` ligado ao bot (incrementa/cria, remove), chaveado pelo `User._id`. Futuro: auto-popular a partir das compras + validade no chat

### Plataforma / negócio (rumo à comercialização)
- 🟡 **Multi-plataforma (Telegram + WhatsApp)** — Plano em [PLANO-MULTIPLATAFORMA.md](./PLANO-MULTIPLATAFORMA.md)
  - ✅ Fase 1 — `BotCore` + camada de adapter (`IncomingMessage`/`Replier`/`IMessagingAdapter`); `TelegramAdapter` (Telegram intacto); orquestrador por `PLATFORMS`
  - ✅ Fase 2 — identidade multi-plataforma (`User.identities[]` + `findByIdentity`); lookups por `(platform, externalId)`; aditivo, sem migração (compras seguem por id externo; migração canônica adiada para a Fase 4)
  - ✅ Fase 3 — `WhatsAppAdapter` (Baileys, login por QR, sessão persistida); habilitado por `PLATFORMS=telegram,whatsapp`; telefone preenchido automaticamente no WhatsApp
  - ⬜ Fases 4-5 — vínculo de contas (= chat web Fase 6), API oficial (Cloud API)
- 🟡 **Chat web (React + Tailwind)** — frontend de chat reusando o `BotCore` via `WebAdapter` (WebSocket). Plano em [../PLANO-WEB-CHAT.md](../PLANO-WEB-CHAT.md)
  - ✅ Fases 1-4 — backend `WebAdapter` (WS), frontend (chat UI, dark/light), Docker/CI, polimento. Sem login (id anônimo)
  - ✅ Fase 5 — **login web em tela própria (e-mail + OTP via WorkOS Magic Auth)**: `LoginModal` (2 passos) + `AuthServer` (`/auth/email/start`, `/auth/email/verify`) → JWT no WS; perfil do WorkOS pula o onboarding; sessão anônima **absorvida** no login. Gated por config; **não exige redirect URI**
  - ✅ Fase 6 — identidade canônica (`Purchase.userId = User._id`) + vínculo multi-plataforma: auto-merge por e-mail/telefone verificados, deep-link (`/start`/`/vincular`) e verificação de e-mail no chat (Magic Auth). Plano em [PLANO-FASE6.md](../PLANO-FASE6.md). Pendente: tela própria de login+OTP
- ✅ **Evolução de produto (cross-plataforma via `BotCore`)** — A1 confirmar, A2 editar/excluir, A3 categorias, A4 multi-idioma. Plano em [../PLANO-EVOLUCAO.md](../PLANO-EVOLUCAO.md)
- ✅ **Push / mensagens não-solicitadas** — `OutboundRegistry` + `sendTo` nos adapters (Telegram/WhatsApp/Web), base para lembretes e futuros avisos
- 🟡 **Planos e limites de uso** (free/pago) — `User.plan` (free/pro); limite de compras/mês no free com CTA de upgrade; planos exibidos na landing. **Falta:** cobrança (Stripe)
- ✅ **Painel web** (React Router) — landing (`/`) + chat (`/chat`) + **painel** (`/painel`, gastos/relatórios) + **conta** (`/conta`, perfil, contas vinculadas, **excluir conta**)
- ✅ **Site de apresentação** — landing no app web com descrição do produto e planos, levando ao login
- ⬜ **Cobrança (Stripe)** — checkout/assinatura para o plano Pro
- 🟡 **Política de privacidade / LGPD** — **Fases 1 e 2 feitas.** Fase 1: página `/privacidade`, **consentimento** (`User.consentVersion/consentAt`), **`/excluir_conta`** (chat) + exclusão (web), logs auditados. Fase 2: **retenção/auto-purga** de sessões anônimas inativas (`RetentionScheduler`, gated por `RETENTION_ENABLED`), **edição de perfil** (`/nome` no chat + `PATCH /api/profile` no web), e **OCR self-hosted** segue como opção configurável (`OCR_PROVIDER=paddle`). **Falta (Fase 3, jurídico):** DPO/ROPA/DPIA

---

## 3. Bugs conhecidos 🐛

Resumo: dos 7 bugs, **6 resolvidos** (B2–B7). Aberto: só **B1** (operacional — rotacionar a chave GCP, depende de você).

| # | Bug | Gravidade | Detalhe |
|---|---|---|---|
| B1 | **Credencial GCP real no disco** | 🔴 | `src/config/google-credentials.json` existe localmente; **ainda usada** pelo caminho padrão (Gemini/Vertex). **Ação (sua):** rotacionar a chave da service account. Não está versionada (gitignore/dockerignore + volume read-only no compose), mas é risco |
| ~~B2~~ | ~~**`Database.connect` engole o erro**~~ | ✅ | Resolvido: `connect()` relança o erro, `index.ts` aborta (exit 1) e há listeners de reconexão |
| ~~B3~~ | ~~**Sem _graceful shutdown_**~~ | ✅ | Resolvido: `index.ts` trata `SIGINT`/`SIGTERM` chamando `bot.stop()` |
| ~~B4~~ | ~~**Consulta usa a data do cupom, não a do registro**~~ | ✅ | Resolvido: gastos/relatórios (`getSpendingSummary`, `getMonthlyTotals`, `getTotalSpent`) agregam pela **data de lançamento** (`createdAt`); a `date` do cupom segue como metadado/exibição |
| ~~B5~~ | ~~**Preferência de modelo de IA é volátil**~~ | ✅ | Resolvido: persistida em `User.aiModel` |
| ~~B6~~ | ~~**OCR de cupom depende de formato rígido**~~ | ✅ | Resolvido: o parser regex (`parseReceiptText`) foi **removido**; a extração é multimodal (Gemini, `OCR_MODE=multimodal`) + **chave/QR da NFC-e** (não depende mais de layout fixo) |
| ~~B7~~ | ~~**Sem retry/fallback quando a IA falha**~~ | ✅ | Resolvido: no `catch`, o `MessageProcessingService` tenta o **modelo alternativo** (gemini↔gpt) antes de devolver erro |

---

## 4. Melhorias (técnicas) 🔧

### Qualidade e robustez
- ✅ **Persistir a escolha de modelo de IA** no usuário (`User.aiModel`) — resolve B5
- ✅ **Tratar erro de conexão do DB** sem engolir + reconexão — resolve B2
- ✅ **Graceful shutdown** (`SIGINT`/`SIGTERM` → `bot.stop()`) — resolve B3
- ✅ **Logger estruturado** (pino) no lugar dos `console.*`
- ✅ **Validação centralizada de variáveis de ambiente** (`config.ts` + `assertRequiredConfig` no startup)
- ✅ **Rate limiting por usuário** (janela deslizante em memória; Redis no futuro para escalar horizontalmente)

### OCR (menor custo + provider trocável)
- 🟡 **Migração de OCR em 4 fases** — detalhes em [PLANO-OCR-FASES.md](./PLANO-OCR-FASES.md) e [PLANO-PADDLEOCR-DOCKER.md](./PLANO-PADDLEOCR-DOCKER.md)
  - ✅ Fase 1 — interface `IOcrProvider` (Vision como provider)
  - ✅ Fase 2 — `GeminiOcrProvider` multimodal como padrão
  - ✅ Fase 3 — chamada multimodal única (`OCR_MODE=multimodal`)
  - ✅ Fase 4 — `PaddleOcrProvider` + projeto `/alfred/ocr-service` (FastAPI/PaddleOCR) + compose
    (build da imagem pendente: exige x86_64; em ARM usar `--platform linux/amd64`)

### Arquitetura / código
- ✅ **Injetar `OcrService`, `GeminiProcessor` e `GptProcessor` via DI** (não recriam mais clients a cada mensagem)
- ✅ **Destino do código de produtos e do parser de OCR**: produtos **ligados** ao bot (`/estoque`); o parser de OCR rígido (`parseReceiptText`) foi **removido** (B6)
- ✅ **Migrar somatórios de gastos para _aggregation_ do Mongo** (`$facet`)
- ✅ **Validação programática dos dados extraídos pela IA** antes de persistir (`validatePurchaseData`) — a confirmação de UX continua em "Funcionalidades que desejamos"

### Testes
- ✅ **Handlers do `BotCore`** cobertos (texto, comandos, confirmação, vínculo, e-mail) com sinon
- ✅ **Repositories** com **MongoDB em memória** (`mongodb-memory-server`) — queries/aggregations reais
- ✅ **API HTTP** (`authServer`) com teste de **integração** (sobe o servidor e bate nos endpoints)
- ✅ **Frontend**: vitest + **React Testing Library** (libs, componente `LoginModal`, página `Dashboard`); `pnpm test:coverage` nos dois projetos
- ⬜ **Testes do fluxo OCR → IA → persistência** (end-to-end)
- ⬜ Subir a cobertura do front (páginas Painel/Conta/Landing com API mockada)

### CI/CD
- ✅ CI roda **lint + type-check + testes com cobertura** (antes só testes) com `--frozen-lockfile`
- ✅ Pre-commit aponta lint (staged) + type-check; testes no pre-push
- ✅ `Dockerfile` multi-stage + `.dockerignore` (deploy agnóstico ao host)
- ⬜ **Definir host e CD** (deploy automático) — Railway/Fly.io/Render/Cloud Run/VPS
- ✅ **Healthcheck / readiness** para o orquestrador (`/health`, `/ready` + HEALTHCHECK no Docker)
- 🟡 **Observabilidade** — `/metrics` (Prometheus) exposto + profile `monitoring` (Prometheus+Grafana) no compose; falta criar dashboards no Grafana

### DevEx / documentação
- ✅ README do projeto (com seções de Deploy e CI)
- ✅ `packageManager` + `.nvmrc` (versões de pnpm/Node fixadas)
- ⬜ `CONTRIBUTING.md` e padronização de mensagens de commit
- ✅ Limpar warnings de `console` do lint (resolvido pelo logger estruturado — 0 warnings)

---

## Sugestão de priorização

1. **Segurança e estabilidade primeiro** (B1, B2, B3) — pré-requisito para qualquer uso real.
2. **Persistir preferências + tratar erros de IA** (B5, B7) — confiabilidade percebida pelo usuário.
3. **Editar/excluir compras + confirmação antes de salvar** — maior ganho de UX no curto prazo.
4. **Relatórios/orçamento/exportação** — valor que sustenta a comercialização.
5. **Painel web + planos + LGPD** — quando partir para o produto pago.
