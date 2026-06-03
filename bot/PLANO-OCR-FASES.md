# Plano — Migração de OCR (Fases 1 a 4)

> Documento de planejamento. **Nada será implementado ainda** — este é o desenho a executar depois.
> Companheiro de [PLANO-PADDLEOCR-DOCKER.md](./PLANO-PADDLEOCR-DOCKER.md) (Fase 4) e do [ROADMAP.md](./ROADMAP.md).
> Última atualização: 02/06/2026.

---

## Context

Hoje o fluxo de foto é: **imagem → Google Vision (OCR) → texto → Gemini (extrai JSON)**
(`src/services/OcrService.ts` chamado em `TelegramBot.handlePhoto`). O Vision é uma **cobrança
separada**, e o objetivo é **menor custo possível** com um **caminho de migração** garantido
(começa <1.000 cupons/mês, podendo crescer até ~20 mil).

Decisão arquitetural: transformar o OCR numa **estratégia trocável** (`IOcrProvider`), igual já
fizemos com `IMessageProcessor` (Gemini/GPT). Trocar de provedor passa a ser **uma variável de
ambiente**, sem reescrever o bot.

### Por que isso reduz custo
- O Gemini já é chamado depois do OCR. Como o **Gemini Flash-Lite é multimodal**, usar o próprio
  Gemini para ler a imagem **elimina a cobrança do Vision** e não exige credencial nova (usa o
  `GCP_PROJECT_ID` já configurado).
- Em ~20 mil/mês: Vision ≈ US$ 28/mês¹; Gemini multimodal ≈ centavos a poucos dólares.

¹ (20.000 − 1.000 grátis) × ~US$1,50/1.000 — *valores aproximados, confirmar preço vigente*.

---

## Arquitetura alvo

```
src/services/ocr/
├── IOcrProvider.ts          # interface { extractTextFromImage(base64): Promise<string> }
├── VisionOcrProvider.ts     # Google Vision (código atual de OcrService)
├── GeminiOcrProvider.ts     # imagem → texto via Gemini Flash-Lite (novo padrão)
└── PaddleOcrProvider.ts     # HTTP para o microserviço FastAPI/PaddleOCR (Fase 4)

src/services/OcrService.ts   # passa a delegar para o IOcrProvider selecionado
```

Seleção por env: `OCR_PROVIDER = gemini (padrão) | vision | paddle`.
O `TelegramBot.handlePhoto` **não muda** nas Fases 1, 2 e 4 — continua chamando
`ocrService.extractTextFromImage(base64)`.

---

## Fase 1 — Abstração `IOcrProvider` (sem mudar comportamento)

**Objetivo:** isolar o OCR atrás de uma interface, mantendo o Google Vision como implementação.

**Arquivos**
- `src/services/ocr/IOcrProvider.ts` (novo)
- `src/services/ocr/VisionOcrProvider.ts` (move o corpo atual de `OcrService`)
- `src/services/OcrService.ts` (vira um *delegator* que recebe o provider via DI)
- `src/infra/Container.ts` (factory que escolhe o provider por env)

**Esboço**
```ts
// IOcrProvider.ts
export interface IOcrProvider {
  extractTextFromImage(base64Image: string): Promise<string>;
}

// VisionOcrProvider.ts  (código atual do OcrService, agora implementando a interface)
@injectable()
export class VisionOcrProvider implements IOcrProvider {
  private client = new ImageAnnotatorClient({ fallback: true });
  async extractTextFromImage(base64Image: string): Promise<string> { /* ...igual hoje... */ }
}

// Container.ts — seleção por env
const provider = (process.env.OCR_PROVIDER ?? "gemini").toLowerCase();
container.bind<IOcrProvider>("IOcrProvider").to(
  provider === "vision" ? VisionOcrProvider :
  provider === "paddle" ? PaddleOcrProvider :
  GeminiOcrProvider,
);
```

**Testes:** garantir que `OcrService` delega ao provider injetado (mock do `IOcrProvider`).
**Risco:** baixo (refactor sem mudança de comportamento).
**Aceite:** suíte verde; foto continua funcionando com `OCR_PROVIDER=vision`.

---

## Fase 2 — `GeminiOcrProvider` como padrão (a economia)

**Objetivo:** ler a imagem direto no Gemini Flash-Lite (OCR-only), aposentar o Vision do caminho
padrão sem mexer no resto do pipeline (texto → `MessageProcessingService` → extração).

**Arquivos**
- `src/services/ocr/GeminiOcrProvider.ts` (novo) — reaproveita o padrão de `GeminiProcessor`
  (`VertexAI` + `getGenerativeModel`).
- `.env_`, `README.md` — documentar `OCR_PROVIDER`.

**Esboço**
```ts
@injectable()
export class GeminiOcrProvider implements IOcrProvider {
  private model = new VertexAI({ project: process.env.GCP_PROJECT_ID, location: "us-central1" })
    .getGenerativeModel({ model: "gemini-2.0-flash-lite-001" });

  async extractTextFromImage(base64Image: string): Promise<string> {
    const result = await this.model.generateContent({
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64Image } },
        { text: "Transcreva TODO o texto deste cupom fiscal, linha a linha, sem interpretar nem resumir." },
      ]}],
    });
    return result.response.candidates[0].content.parts[0].text ?? "";
  }
}
```

**Default:** `OCR_PROVIDER=gemini`.
**Testes:** stub do `generateContent` (igual `GeminiProcessor.test.ts`) retornando texto.
**Risco:** baixo–médio (depende da qualidade do Gemini na transcrição — validar com cupons reais).
**Aceite:** foto registrada corretamente com `OCR_PROVIDER=gemini`; Vision selecionável por env.

**Teste A/B sugerido:** como Vision e Gemini implementam a mesma interface, rodar uns 5–10 cupons
reais nos dois e comparar acerto antes de fixar o padrão.

---

## Fase 3 — Chamada multimodal única (custo mínimo absoluto)

**Objetivo:** colapsar **OCR + extração numa só chamada** ao Gemini (imagem → JSON direto),
eliminando o passo intermediário de texto. É o caminho mais barato (1 call em vez de 2).

**Mudança de fluxo:** diferente das outras fases, aqui o `handlePhoto` não passa mais por
"texto → extrair". Introduz-se um caminho multimodal no processamento.

**Arquivos**
- `src/services/MessageProcessingService.ts` — novo método `processImage(userId, base64): Promise<ModelResponse>`.
- `src/services/GeminiProcessor.ts` — aceitar `parts` com `inlineData` reutilizando `getPrompt001`.
- `src/services/TelegramBot.ts` — `handlePhoto` chama `processImage` quando o provider multimodal
  estiver ativo (flag/capacidade), senão mantém o caminho OCR→extração.

**Esboço**
```ts
// GeminiProcessor: além de processMessage(text), um processImage(base64)
async processImage(base64Image: string): Promise<ModelResponse | null> {
  const result = await this.model.generateContent({
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "image/jpeg", data: base64Image } },
      { text: getPrompt001(null, "(conteúdo na imagem do cupom acima)") },
    ]}],
  });
  return validateAndConvertModelResponse(result.response.candidates[0].content.parts[0].text);
}
```

**Risco:** médio (toca no fluxo principal). Manter como **opção** atrás de flag
(`OCR_MODE=ocr|multimodal`) para poder reverter.
**Aceite:** foto → JSON em uma única chamada; queda de custo medível; fallback para OCR→extração.
**Quando ligar:** quando o volume justificar a otimização e o A/B confirmar a precisão.

---

## Fase 4 — `PaddleOcrProvider` (self-host, para estudo)

**Objetivo:** provider que chama um **microserviço FastAPI + PaddleOCR em Docker** (detalhado em
[PLANO-PADDLEOCR-DOCKER.md](./PLANO-PADDLEOCR-DOCKER.md)). O bot consome **internamente** pela rede
Docker. Mantém a mesma interface — zero impacto no resto.

**Arquivos**
- `src/services/ocr/PaddleOcrProvider.ts` (novo)
- `.env_`, `README.md` — `OCR_PROVIDER=paddle`, `PADDLE_OCR_URL`

**Esboço**
```ts
@injectable()
export class PaddleOcrProvider implements IOcrProvider {
  private url = process.env.PADDLE_OCR_URL ?? "http://ocr:8000";
  async extractTextFromImage(base64Image: string): Promise<string> {
    const res = await fetch(`${this.url}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image }),
    });
    if (!res.ok) throw new Error(`OCR service error: ${res.status}`);
    const data = (await res.json()) as { text: string };
    return data.text;
  }
}
```

**Risco:** infra (serviço Python à parte, RAM, container). Custo do EC2 ligado 24/7 — ver nota de
custo abaixo.
**Aceite:** `OCR_PROVIDER=paddle` + serviço no compose → foto processada via PaddleOCR interno.

> ⚠️ **Nota de custo (importante):** PaddleOCR é "grátis", mas exige um EC2 ligado o tempo todo
> (t3.small/medium, ~US$15–30/mês). No seu volume isso tende a custar **mais** que Gemini/Vision —
> por isso a Fase 4 é primariamente **para estudo** e fica como rota de escala futura/privacidade.

---

## Variáveis de ambiente (a adicionar)

```dotenv
# gemini (padrão) | vision | paddle
OCR_PROVIDER=gemini
# usado quando OCR_PROVIDER=paddle (rede interna do docker-compose)
PADDLE_OCR_URL=http://ocr:8000
# (Fase 3) ocr | multimodal
OCR_MODE=ocr
```

---

## Ordem de execução e critérios

| Fase | Entrega | Pré-requisito | Risco |
|---|---|---|---|
| 1 | Interface + Vision como provider | — | Baixo |
| 2 | GeminiOcrProvider padrão + A/B | Fase 1 | Baixo–médio |
| 3 | Chamada multimodal única (flag) | Fase 2 | Médio |
| 4 | PaddleOcrProvider + serviço Docker | Fase 1 | Infra |

**Princípios:**
- Cada fase mantém a anterior funcionando (provider selecionável por env → rollback trivial).
- Sem credencial nova para Gemini (usa Vertex já configurado).
- Cobrir cada provider com teste (mockando a chamada externa).
- Documentar `OCR_PROVIDER` no README/`.env_` a cada fase que mexe nele.
