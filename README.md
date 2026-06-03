# bot-telegram

Bot de Telegram que **registra compras e gastos pessoais** a partir de **texto livre** ou de **fotos de cupons fiscais**. Usa IA (Google Gemini / OpenAI GPT) para interpretar a mensagem, OCR (Google Vision) para ler imagens, e persiste tudo em **MongoDB**.

> Exemplo: o usuário envia `"agua 7"` ou a foto de um cupom, e o bot estrutura e registra a compra. Depois pergunta `"quanto gastei esse mês?"` (ou usa `/gastos`) e recebe um relatório.

---

## ✨ Funcionalidades

- **Cadastro automático do usuário** — identifica pelo ID do Telegram, aproveita o nome do perfil e (opcionalmente) o telefone; saúda o usuário recorrente pelo nome.
- **Registro de compras por texto** — interpreta linguagem natural (`"4 galões agua 80"`) via IA.
- **Registro por foto de cupom fiscal** — OCR (Google Vision) + IA para extrair itens, loja, total, impostos.
- **Consulta de gastos** — por período (mês atual, mês passado, total) e com quebra por categoria/loja, via linguagem natural ou comando `/gastos`.
- **Escolha do modelo de IA por usuário** — Gemini (padrão) ou GPT, via `/ia`.

---

## 🧰 Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript 5 (Node.js) |
| Bot | [Telegraf](https://telegraf.js.org/) 4 |
| IA (texto) | Google Vertex AI — Gemini 2.0 Flash Lite · OpenAI GPT-4 Turbo |
| OCR (imagem) | Google Cloud Vision |
| Banco | MongoDB (Atlas) via Mongoose 8 |
| Injeção de dependência | InversifyJS |
| Testes | Jest + ts-jest + Sinon |
| Qualidade | ESLint + Prettier + Husky + lint-staged |

---

## 🚀 Como rodar

### Pré-requisitos
- Node.js 18+ e [pnpm](https://pnpm.io/)
- Um bot do Telegram (token via [@BotFather](https://t.me/BotFather))
- Um cluster MongoDB (ex.: MongoDB Atlas)
- Projeto no Google Cloud com **Vertex AI** e **Vision API** habilitadas + uma _service account_
- (Opcional) Chave da OpenAI, se for usar o modelo GPT

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Configurar variáveis de ambiente
Copie o template `.env.sample` para `.env` e preencha:

```bash
cp .env.sample .env
```

```dotenv
DATABASE_URL=                      # string de conexão do MongoDB
TELEGRAM_TOKEN=                    # token do bot (BotFather)

GOOGLE_APPLICATION_CREDENTIALS=    # caminho para o JSON da service account do GCP
GCP_PROJECT_ID=                    # ID do projeto no Google Cloud

OPENAI_API_KEY=                    # opcional, apenas para o modelo GPT

OCR_PROVIDER=gemini                # provedor de OCR: "gemini" (padrão) ou "vision"
OCR_MODE=ocr                       # "ocr" (padrão) ou "multimodal" (imagem → JSON em 1 chamada)
```

> ⚠️ **Segurança:** nunca versione o `.env` nem o JSON de credenciais do Google. Ambos já estão no `.gitignore`. Use `src/config/google-credentials_model.json` apenas como modelo.

### 3. Rodar em desenvolvimento
```bash
pnpm dev
```

### 4. Build e produção
```bash
pnpm build   # compila para dist/
pnpm start   # roda dist/index.js
```

---

## 🤖 Comandos do bot

| Comando | Descrição |
|---|---|
| `/start` | Inicia o bot e o cadastro |
| `/gastos` | Relatório de gastos do mês atual |
| `/compras` | Lista as últimas 5 compras |
| `/ia gpt` \| `/ia gemini` | Define o modelo de IA para o seu usuário |
| `/pular` | Pula a etapa de e-mail no cadastro |

Além dos comandos, basta **enviar uma mensagem de texto** descrevendo a compra, uma **foto de cupom**, ou uma **pergunta sobre gastos**.

---

## 📜 Scripts

| Script | O que faz |
|---|---|
| `pnpm dev` | Sobe o bot em modo watch (nodemon + ts-node) |
| `pnpm build` | Compila TypeScript para `dist/` |
| `pnpm start` | Executa a build (`dist/index.js`) |
| `pnpm test` | Roda os testes (Jest) |
| `pnpm test:coverage` | Testes com cobertura |
| `pnpm lint` / `pnpm lint:fix` | Lint (ESLint) |
| `pnpm prettier` | Formata o código |

---

## 🗂️ Estrutura

```
src/
├── index.ts                  # Entry point: conecta o DB e sobe o bot
├── infra/
│   ├── Container.ts          # Registro de injeção de dependência (Inversify)
│   ├── Database.ts           # Conexão MongoDB
│   └── converters/           # ModelResponse → Purchase, validação da resposta da IA
├── services/
│   ├── TelegramBot.ts        # Handlers (texto, foto, contato, comandos)
│   ├── UserService.ts        # Cadastro/onboarding do usuário
│   ├── MessageProcessingService.ts  # Roteia mensagem para o processador de IA
│   ├── GeminiProcessor.ts / GptProcessor.ts  # Integrações de IA
│   ├── OcrService.ts         # Google Vision
│   └── PurchaseService.ts / ProductService.ts
├── repositories/             # Acesso a dados (User, Purchase, Product)
├── models/                   # Schemas Mongoose (User, Purchase, Product)
├── IA/prompts.ts             # Prompt de extração para a IA
├── utils/                    # Erros e validações
└── tests/                    # Testes (Jest)
```

**Arquitetura:** camadas `Handler (Bot) → Service → Repository → Model`, com injeção de dependência via Inversify e padrão Strategy para alternar entre os modelos de IA.

---

## 🧪 Testes

```bash
pnpm test
```

Os testes cobrem onboarding (`UserService`), conversão/validação das respostas da IA, serviços de compra e relatórios de gastos.

---

## 🐳 Deploy (Docker — agnóstico ao host)

O projeto inclui um `Dockerfile` multi-stage (build → runtime) pronto para qualquer provedor
(Railway, Fly.io, Render, Google Cloud Run, VPS, Kubernetes…). O host ainda **não** foi escolhido —
a imagem é portável e recebe as configurações por variáveis de ambiente em runtime.

```bash
# Build da imagem
docker build -t bot-telegram .

# Run (passando as variáveis e o JSON de credenciais do Google como volume)
docker run --rm \
  -e DATABASE_URL="..." \
  -e TELEGRAM_TOKEN="..." \
  -e GCP_PROJECT_ID="..." \
  -e GOOGLE_APPLICATION_CREDENTIALS="/secrets/google-credentials.json" \
  -v /caminho/local/google-credentials.json:/secrets/google-credentials.json:ro \
  bot-telegram
```

Notas:
- **Segredos não são embutidos na imagem** — forneça-os pelo host (variáveis/secrets/volumes).
- O bot trata `SIGINT`/`SIGTERM` (encerramento limpo), então pára corretamente em deploys/restart.
- Em caso de falha na inicialização, o processo sai com código ≠ 0 (o orquestrador reinicia/reporta).

## 🔄 CI

O workflow [`.github/workflows/test.yml`](./.github/workflows/test.yml) roda em push/PR para `main`:
instala com lockfile congelado (`--frozen-lockfile`), executa **lint**, **type-check**, **testes com
cobertura** e envia o relatório ao Codecov.

## 📌 Roadmap

Funcionalidades atuais, desejadas, bugs conhecidos e melhorias estão documentados em **[ROADMAP.md](./ROADMAP.md)**. A análise técnica geral do projeto está em **[ANALISE-PROJETO.md](./ANALISE-PROJETO.md)**.
