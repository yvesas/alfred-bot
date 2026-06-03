# Plano — Qualidade, robustez e arquitetura

> Lote de fundação a resolver **antes** do multi-plataforma. Itens vindos do
> [ROADMAP.md](./ROADMAP.md) (seções "Qualidade e robustez" e "Arquitetura / código",
> exceto a decisão sobre produtos/parser de OCR).
> Última atualização: 03/06/2026.

Ordem pensada para minimizar retrabalho (logger e config são base dos demais).

---

## 1. Logger estruturado (pino)
**Resolve:** item "Logger estruturado" + "limpar warnings de `console`" (16 hoje).
- Add `pino` (+ `pino-pretty` em dev). Criar `src/infra/logger.ts`.
- Substituir `console.*` por `logger.*` em services/infra (Database, TelegramBot,
  MessageProcessingService, GptProcessor, providers de OCR, converters, index).
- **Default:** nível por env `LOG_LEVEL` (info em prod, debug em dev).

## 2. Config/env centralizada
**Resolve:** "Validação centralizada de variáveis de ambiente".
- `src/infra/config.ts`: lê e valida o env **uma vez** no startup; expõe objeto tipado.
- **Obrigatórias:** `DATABASE_URL`, `TELEGRAM_TOKEN`. **Por provider (validadas no uso):**
  `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `OPENAI_API_KEY`, `PADDLE_OCR_URL`.
  Com default: `OCR_PROVIDER`, `OCR_MODE`, `LOG_LEVEL`, `RATE_LIMIT*`.
- Remove o `throw` no topo de `TelegramBot` e os `process.env.*` espalhados (passam a ler do config).

## 3. B2 — `Database.connect` robusto
**Resolve:** bug B2 (🔴).
- `connect()` **relança** o erro (não engole); `index.ts` captura e `process.exit(1)` (container reinicia).
- Listeners do mongoose (`disconnected`/`reconnected`/`error`) logando via logger.

## 4. DI dos processadores de IA
**Resolve:** "Injetar `GeminiProcessor`/`GptProcessor` via DI" (o `OcrService` já é DI).
- Tornar `GeminiProcessor`/`GptProcessor` `@injectable`, registrar no Container.
- Injetá-los no `MessageProcessingService` (fim do `new` a cada mensagem — hoje recria os clients
  VertexAI/OpenAI toda hora). Seleção por modelo.

## 5. B5 — persistir escolha de modelo de IA
**Resolve:** bug B5.
- `User.aiModel?: "gemini" | "gpt"`. `UserService.setAiModel/getAiModel` (persiste no Mongo).
- `/ia` grava no User; o processamento lê do User. Remove o `Map` em memória.

## 6. Somatórios via aggregation do Mongo
**Resolve:** "Migrar somatórios para aggregation".
- `PurchaseRepository.getSpendingSummary` com pipeline `$facet`: `$match` por usuário/período;
  total+count+byStore por compra; `$unwind` items para byCategory. Mantém o shape `SpendingSummary`
  (Service e testes não mudam).

## 7. Validação extra dos dados da IA antes de persistir
**Resolve:** "Confirmação/validação extra antes de persistir" (validação **programática**, não a UX de
"confirmar compra" — essa é outro item, em "Funcionalidades que desejamos").
- Antes do `addPurchase`: `total` finito e > 0, `description` não-vazia, itens com números válidos;
  rejeitar dados implausíveis com mensagem amigável.

## 8. Rate limiting por usuário
**Resolve:** "Rate limiting / proteção contra abuso".
- `RateLimiter` (janela deslizante em memória) aplicado na entrada de mensagens (texto/foto).
- **Default:** `RATE_LIMIT_MAX=20` por `RATE_LIMIT_WINDOW_MS=60000`, configurável por env.
- **Nota:** em memória = por instância; para escalar horizontalmente, migrar para Redis depois.

## 9. Verificação + ROADMAP
- `typecheck` + `lint` (0 warnings de console agora) + `test` verdes.
- Atualizar ROADMAP marcando B2, B5 e os itens de qualidade/arquitetura como resolvidos.

---

## Sugestão de commits
Um commit por item (1–8) + o de verificação/roadmap (9), ou agrupar 2+3 (robustez) e 4+5 (IA).
Cada item mantém a suíte verde.
