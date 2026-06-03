# Análise do Projeto — bot-telegram

> Documento gerado em **02/06/2026** para retomada do projeto.
> Objetivo: registrar o estado atual, estrutura, qualidade de código, propósito e recomendações antes de definir um novo rumo e buscar a comercialização.

---

## 1. Resumo executivo

`bot-telegram` é um **bot de Telegram em TypeScript que registra compras/gastos pessoais a partir de texto livre ou de fotos de cupons fiscais**, usando IA (Google Gemini / OpenAI GPT) para interpretar a mensagem e OCR (Google Vision) para ler imagens. Os dados são persistidos em MongoDB.

O projeto está em estágio de **MVP funcional / prova de conceito**. A arquitetura base é sólida e bem organizada (camadas, injeção de dependência, testes), mas há **lacunas importantes** que impedem o uso em produção: o fluxo de consulta de gastos não está implementado, o `userId` não é preenchido no caminho da IA, há inconsistências de schema e **um arquivo de credenciais reais está presente no disco**.

**Veredito:** boa fundação técnica para evoluir, mas precisa de uma rodada de correções e de uma definição clara de produto antes de comercializar.

---

## 2. O que o projeto faz (propósito)

O propósito é claro e identificável a partir do código (mensagem inicial do bot e prompts):

> *"Olá! Envie um cupom fiscal ou use /compras para ver seus gastos."*

Trata-se de um **assistente financeiro pessoal via Telegram** ("controle de gastos por cupom"). Fluxos previstos:

| Entrada do usuário | O que acontece |
|---|---|
| **Texto** (ex: `"agua 7"`, `"4 galões agua 80"`) | IA interpreta como compra, extrai item/quantidade/preço e registra |
| **Foto de cupom fiscal** | OCR (Google Vision) extrai o texto → IA estrutura os dados → registra a compra |
| **/compras** | Lista as últimas 5 compras registradas |
| **/ia gpt** \| **/ia gemini** | Troca o modelo de IA usado por aquele usuário |
| **Pergunta** (ex: *"Quanto gastei este mês?"*) | Deveria responder consulta — **intenção `query` reconhecida pela IA, mas o handler não trata isso (não implementado)** |

### Comandos disponíveis
- `/start` — mensagem de boas-vindas
- `/compras` — lista as 5 últimas compras
- `/ia <gpt|gemini>` — define o modelo de IA por usuário (apenas em memória)

---

## 3. Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript 5.7 (target ESNext, módulos CommonJS) |
| Runtime | Node.js (`ts-node` / `nodemon` em dev) |
| Bot framework | **Telegraf 4.16** (também há `node-telegram-bot-api` instalado, mas não usado) |
| IA — texto | Google Vertex AI — **Gemini 2.0 Flash Lite** (padrão) e OpenAI **GPT-4 Turbo** |
| OCR — imagem | Google Cloud Vision (`textDetection`) |
| Banco de dados | MongoDB via **Mongoose 8** (MongoDB Atlas) |
| Injeção de dependência | **InversifyJS 6** + `reflect-metadata` |
| Testes | Jest 29 + ts-jest + Sinon |
| Qualidade | ESLint 9 + Prettier + Husky + lint-staged (pre-commit) |

---

## 4. Estrutura do projeto

```
src/
├── index.ts                      # Entry point: conecta DB e sobe o bot
├── infra/
│   ├── Container.ts              # Registro de DI (Inversify)
│   ├── Database.ts               # Conexão MongoDB
│   └── converters/
│       ├── purchaseConverter.ts        # ModelResponse → IPurchaseCreate
│       └── modelResponseConverter.ts   # valida/parseia JSON da IA
├── services/
│   ├── TelegramBot.ts            # Handlers (texto, foto, comandos)
│   ├── MessageProcessingService.ts  # Roteia para o processador de IA por usuário
│   ├── GeminiProcessor.ts        # Integração Vertex AI / Gemini
│   ├── GptProcessor.ts           # Integração OpenAI / GPT
│   ├── OcrService.ts             # Google Vision + parser de cupom (regex)
│   ├── PurchaseService.ts        # Regras de negócio de compras
│   └── ProductService.ts         # Regras de negócio de produtos (não usado no bot)
├── repositories/
│   ├── PurchaseRepository.ts     # Acesso a dados de compras
│   └── ProductRepository.ts      # Acesso a dados de produtos
├── models/
│   ├── Purchase.ts               # Schema/Interface Mongoose
│   └── Product.ts                # Schema/Interface Mongoose
├── IA/
│   └── prompts.ts                # Prompt de extração (getPrompt001)
├── utils/
│   └── errors.ts                 # Classes de erro customizadas
├── config/
│   ├── google-credentials_model.json   # Template (versionado, sem segredos)
│   └── google-credentials.json         # ⚠️ Credenciais REAIS no disco
└── tests/                        # 7 suítes, 21 testes
```

**Arquitetura:** clássica em camadas — `Handler (Bot) → Service → Repository → Model`. A separação de responsabilidades é boa e o padrão **Strategy** (via `IMessageProcessor`) permite trocar entre Gemini e GPT de forma limpa. Boa base para escalar.

**Métricas:** ~1.440 linhas de TypeScript no `src/` (incluindo testes).

---

## 5. Qualidade de código

### Pontos fortes ✅
- **Organização em camadas clara** e consistente; fácil de navegar.
- **Injeção de dependência** (Inversify) configurada corretamente para services/repositories.
- **TypeScript em modo `strict`** ativado.
- **Tooling de qualidade configurado**: ESLint + Prettier + Husky (pre-commit com lint-staged).
- **Testes existem e passam**: 7 suítes / 21 testes verdes; boa cobertura nos converters (~87%) e models (100%).
- **Tratamento de erros** com classes customizadas (`ValidationError`, etc.) e validação defensiva do JSON retornado pela IA.
- **Abstração de IA** bem desenhada (interface comum, troca de modelo por usuário).

### Pontos fracos / dívidas técnicas ⚠️

**Bugs e inconsistências funcionais:**
1. **`userId` nunca é preenchido no fluxo de IA.** O `processMessage` recebe `userId`, mas não o injeta no resultado. O `convertModelResponseToPurchase` lê `input.userId` (vindo da IA, que não o conhece) → compras provavelmente são salvas com `userId` inválido/`undefined`. **Bug crítico** — quebra o multiusuário.
2. **Consulta de gastos (`intent: "query"`) não é tratada.** A IA classifica, `getTotalSpent` existe no service/repo, mas nenhum handler conecta os dois. Funcionalidade prometida na mensagem de boas-vindas, porém ausente.
3. **Inconsistência no schema `store`.** Em `Purchase.ts` está definido como **array** (`[StoreSchema]`), mas todo o resto do código trata `store` como **objeto único** (`IStoreInfo`). Vai gerar dados malformados.
4. **`MessageProcessingService.processMessage` pode retornar `string`** (mensagens de erro como `"🤖 Não entendi..."`) onde o tipo esperado é `ModelResponse`. O `TelegramBot` então acessa `.message`/`.total` em algo que pode ser string. Tipagem frouxa que mascara erros.
5. **`OcrService.parseReceiptText` e todo o `ProductService`/`ProductRepository` estão implementados mas nunca são chamados** — código morto / funcionalidade pela metade.

**Qualidade geral:**
6. **Sem README** nem documentação de setup/execução.
7. **Inconsistência de design:** `OcrService`, `GeminiProcessor` e `GptProcessor` **não usam DI** (são instanciados com `new`), diferente do resto. `GeminiProcessor`/`GptProcessor` são recriados a cada mensagem.
8. **Validação de ambiente espalhada:** `token` é checado no escopo do módulo (`throw` na importação), o que dificulta testes.
9. **Uso de `any`** em vários pontos (Gemini, converters) — perde garantias do TypeScript.
10. **`console.log` de debug** deixado em produção (inclui dump de dados processados).
11. **Cobertura de testes desigual:** repositories ~50%, services ~80%; handlers do bot e processadores de IA quase sem teste de integração.
12. **`package.json` incompleto:** `description`, `author`, `keywords` vazios; scripts duplicados (`dev`/`dev2`); dependência `"fs": "0.0.1-security"` (pacote placeholder, deve ser removida); `node-telegram-bot-api` instalado mas não usado.
13. **`Database.connect` engole o erro** (apenas loga) — a aplicação continua subindo mesmo sem banco.

### 🔴 Segurança (atenção imediata)
- **`src/config/google-credentials.json` (credenciais reais, 2.369 bytes) está presente no disco.** Embora o `.gitignore` contenha `google-credentials.json` (não está versionado no git — verificado ✅), o arquivo existe localmente e é fácil vazar. **Recomendação:** rotacionar essa chave de service account do GCP por precaução e nunca commitá-la.
- `.env` **não** está versionado (✅ correto). Existe um `.env_` como template.
- O `TELEGRAM_TOKEN` é interpolado em URL de download de imagem — ok, mas centralizar o acesso a env vars seria mais seguro.

---

## 6. Estado do repositório

- Branch ativa: `main` (há uma branch remota com typo: `origin/mai`).
- Último commit: **10/03/2025** — projeto parado há ~15 meses.
- Histórico mostra evolução incremental coerente (setup → DB → bot → OCR → processadores de IA → testes → tooling), porém com **mensagens de commit duplicadas** (vários pares idênticos), sugerindo retrabalho/rebases.
- Build (`tsc`) e testes (`jest`) configurados; a pasta `dist/` versionada localmente (mas no `.gitignore`).

---

## 7. Recomendações para retomada

### Antes de qualquer coisa (higiene)
1. **Rotacionar a chave do Google Cloud** e remover/proteger `google-credentials.json`.
2. **Escrever um README** com setup, variáveis de ambiente e como rodar.
3. Limpar `package.json` (remover `fs`, `node-telegram-bot-api` e `dev2`; preencher metadados).

### Correções funcionais (para virar produto utilizável)
4. **Corrigir o preenchimento de `userId`** em todo o fluxo (texto e foto) — bug que quebra multiusuário.
5. **Implementar a consulta de gastos** (`intent: "query"` → `getTotalSpent`/relatórios).
6. **Corrigir o schema `store`** (objeto, não array).
7. **Endurecer a tipagem** de `processMessage` (nunca retornar string onde se espera `ModelResponse`).
8. Decidir o destino do `ProductService`/OCR-parser: usar ou remover.

### Para comercializar (próximo rumo)
9. **Definir o público e a proposta de valor:** controle de gastos pessoais? PMEs/MEIs? Categorização automática + relatórios? Integração com cupom fiscal eletrônico (NFC-e/SAT)?
10. **Multi-tenancy real:** isolamento de dados por usuário, autenticação, planos/limites.
11. **Custos de IA:** Gemini Flash Lite é barato; mapear custo por mensagem/OCR para precificar.
12. **Observabilidade e produção:** trocar `console.log` por logger estruturado, monitoramento, tratamento de falhas da IA, rate limiting.
13. **LGPD:** dados financeiros são sensíveis — política de privacidade, consentimento, retenção e criptografia.
14. **Roadmap de produto:** dashboards/relatórios (mensal, por categoria, por loja), exportação, alertas de orçamento, lembretes — diferenciais comercializáveis a partir da base atual.

---

## 8. Conclusão

O `bot-telegram` é um **MVP bem estruturado de um assistente financeiro pessoal no Telegram** com um diferencial técnico interessante: **OCR de cupom + interpretação por IA com escolha de modelo**. A fundação de engenharia (camadas, DI, testes, tooling) está **acima da média para um projeto em estágio inicial** e suporta evolução.

Para retomar com foco em comercialização, o caminho é: (1) resolver as pendências de segurança e os bugs que quebram o multiusuário/consulta, (2) completar o fluxo de relatórios — o verdadeiro valor para o usuário final, e (3) definir claramente o público-alvo e o modelo de negócio. A base existe; o que falta é fechar o produto.
