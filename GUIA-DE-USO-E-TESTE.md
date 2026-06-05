# Guia de uso e teste — Alfred Bot

Como configurar, rodar e **testar** o bot (Telegram e/ou WhatsApp), local e via Docker.

---

## 1. O que o bot faz

Assistente financeiro no Telegram/WhatsApp: você envia uma compra por **texto** (ex.: `agua 7`) ou a
**foto de um cupom fiscal**, e o bot interpreta com IA (Gemini/GPT) + OCR e registra. Depois você
consulta os gastos. Tudo persistido em MongoDB.

---

## 2. Pré-requisitos

- **Node.js 20+** e **pnpm** (ou só Docker, para o caminho conteinerizado)
- **MongoDB** (ex.: MongoDB Atlas) → `DATABASE_URL`
- **Bot do Telegram**: crie no [@BotFather](https://t.me/BotFather) → `TELEGRAM_TOKEN`
- **Google Cloud** com **Vertex AI** (Gemini) habilitado + service account → `GCP_PROJECT_ID` e o JSON
  em `GOOGLE_APPLICATION_CREDENTIALS`. (Para OCR via Vision, habilite também a **Vision API**.)
- **(Opcional)** Chave da OpenAI (`OPENAI_API_KEY`) se for testar o modelo GPT
- **(WhatsApp)** um número dedicado para escanear o QR (Baileys é não-oficial — risco de ban)

---

## 3. Configuração (.env)

No diretório `bot/`:

```bash
cp .env.sample .env
```

Preencha o essencial e escolha as plataformas:

```dotenv
DATABASE_URL=mongodb+srv://...           # obrigatório
TELEGRAM_TOKEN=123456:ABC...             # obrigatório
GCP_PROJECT_ID=meu-projeto
GOOGLE_APPLICATION_CREDENTIALS=./src/config/google-credentials.json

# Plataformas ativas:
PLATFORMS=telegram                       # ou: telegram,whatsapp

# OCR (padrão gemini multimodal): gemini | vision | paddle
OCR_PROVIDER=gemini
```

> O app **falha cedo e claro** se faltar `DATABASE_URL` ou `TELEGRAM_TOKEN`.

---

## 4. Rodar

### Local (desenvolvimento)
```bash
cd bot
pnpm install
pnpm dev          # sobe em modo watch
```
No log deve aparecer `✅ Conectado ao MongoDB`, `🚀 Telegram adapter iniciado` e `🚀 Bot is ready!`.

### Via Docker (a partir da raiz `/alfred-bot`)
```bash
docker compose up -d                      # só o bot
docker compose --profile paddle up -d     # bot + OCR self-hosted (PaddleOCR)
docker compose --profile monitoring up -d # bot + Prometheus + Grafana
docker compose logs -f bot                # acompanhar o log
```

---

## 5. Testar no **Telegram**

Abra a conversa com o seu bot no Telegram e siga:

| Passo | O que enviar | Resposta esperada |
|---|---|---|
| 1. Início | `/start` | Saudação + "como você se chama?" (ou já saúda pelo nome se o perfil tiver) |
| 2. Nome | `João` | "Prazer, João! Me informe seu e-mail…" (com botão **Compartilhar telefone**) |
| 3. E-mail | `joao@email.com` ou `/pular` | "✅ Cadastro concluído!" |
| 4. Compra simples | `agua 7` | "🛒 Compra registrada: … Total de R$ 7,00" |
| 5. Compra com qtd | `4 galões agua 80` | Registra com quantidade/preço unitário |
| 6. Cupom por foto | envie a **foto de um cupom** | Extrai e registra a compra |
| 7. Consulta | `quanto gastei esse mês?` | "📊 Gastos deste mês: R$ X em N compra(s)." |
| 8. Por categoria | `meus gastos por categoria` | Relatório com quebra por categoria |
| 9. Comando | `/gastos` | Relatório do mês atual |
| 10. Histórico | `/compras` | Últimas 5 compras |
| 11. Trocar IA | `/ia gpt` / `/ia gemini` | "🤖 Modelo atualizado para …" (persiste) |

**Dica:** envie muitas mensagens seguidas para ver o **rate limit** (`⏳ Muitas mensagens…`).

---

## 6. Testar no **WhatsApp** (Baileys)

1. No `.env`: `PLATFORMS=telegram,whatsapp` (ou só `whatsapp`).
2. `pnpm dev` → um **QR code** aparece no terminal.
3. No celular do **número que será o bot**: WhatsApp → Aparelhos conectados → Conectar um aparelho →
   escaneie o QR. No log: `🚀 WhatsApp adapter conectado`.
4. De **outro** número, mande mensagens para o número do bot e repita os fluxos da seção 5
   (`agua 7`, foto de cupom, `quanto gastei?`, `/gastos`, etc.).

Diferenças no WhatsApp:
- Não há botão de "compartilhar telefone" (o número já é conhecido → o **telefone é preenchido
  automaticamente** no cadastro).
- A sessão fica em `WHATSAPP_SESSION_DIR` (`./.wa-session`, **gitignorado**). Apague essa pasta para
  forçar um novo QR.

> ⚠️ Baileys é **não-oficial** (contra os ToS) — use um número dedicado; há risco de ban.

---

## 7. Health, readiness e métricas

O bot expõe um servidor HTTP em `HEALTH_PORT` (default `3000`):

```bash
curl localhost:3000/health    # {"status":"ok"}  (liveness)
curl localhost:3000/ready     # 200 se DB conectado, senão 503  (readiness)
curl localhost:3000/metrics   # métricas Prometheus
```

---

## 8. Observabilidade (Prometheus + Grafana)

```bash
docker compose --profile monitoring up -d
```
- **Grafana:** http://localhost:3001 (login inicial `admin` / `admin`).
- Adicione um **data source Prometheus** com a URL `http://prometheus:9090`.
- Métricas da app: `alfred_bot_messages_received_total`, `alfred_bot_purchases_registered_total`,
  `alfred_bot_ai_errors_total` (+ métricas padrão do Node).

---

## 9. Testes automatizados

No diretório `bot/`:
```bash
pnpm test            # suíte (Jest)
pnpm test:coverage   # com cobertura
pnpm typecheck       # checagem de tipos
pnpm lint            # ESLint
```

---

## 10. Troubleshooting

| Sintoma | Provável causa / solução |
|---|---|
| `Variáveis de ambiente obrigatórias ausentes: …` | Falta `DATABASE_URL`/`TELEGRAM_TOKEN` no `.env` |
| Sai com erro logo após iniciar | Falha ao conectar no MongoDB — confira `DATABASE_URL`/IP allowlist do Atlas |
| Telegram não responde | Token errado, ou outra instância usando o mesmo bot (long polling duplicado) |
| QR do WhatsApp não conecta | Refaça o scan; apague `./.wa-session` para gerar novo QR |
| `❌ Não consegui registrar essa compra…` | Dados implausíveis (validação) — reenvie com o valor claro |
| Erro ao processar foto | Credenciais do GCP/OCR; teste `OCR_PROVIDER=vision` vs `gemini` |
| `⏳ Muitas mensagens…` | Rate limit — ajuste `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` |
| Build do `ocr-service` falha no Mac | `paddlepaddle` não tem wheel arm64 — use `--platform linux/amd64` (ver `ocr-service/README.md`) |

---

Para a arquitetura e o roadmap, veja `bot/README.md`, `bot/ROADMAP.md` e os planos em `bot/PLANO-*.md`.
