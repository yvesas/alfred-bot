# ADR-0003 — IA e OCR atrás de interface, escolhidos por ambiente

**Data:** 2026-03 a 2026-06 (registrado retroativamente em 2026-08-14)
**Status:** aceito, em vigor
**Contexto original:** "PLANO-OCR-FASES" e "PLANO-PADDLEOCR-DOCKER" — perdidos

## Contexto

A leitura de cupom começou com Google Vision (OCR) + regex (`parseReceiptText`)
para extrair os campos. Duas dores apareceram juntas:

1. **O parser quebrava.** Cada rede de mercado imprime o cupom de um jeito; regex
   sobre layout fixo não sobrevive a isso (bug B6).
2. **O custo.** Vision cobra por imagem, e toda foto passava por ele.

E havia uma terceira pressão: o usuário podia querer GPT em vez de Gemini.

## Decisão

**Dois contratos, várias implementações, escolha por variável de ambiente.**

### OCR — `IOcrProvider`

Um método: `extractTextFromImage(base64) => Promise<string>`. Três providers —
`VisionOcrProvider`, `GeminiOcrProvider`, `PaddleOcrProvider` (microserviço
FastAPI próprio). A factory em `infra/Container.ts` lê `OCR_PROVIDER` e faz o
bind; valor desconhecido cai no Gemini com um warn. O bot fala com `OcrService`,
uma fachada que não conhece o provider concreto.

### IA — `IMessageProcessor`

`processMessage(texto, categorias?, idioma?)` obrigatório e
**`processImage?()` opcional**. `GeminiProcessor` implementa os dois;
`GptProcessor` só o primeiro. Quando o método opcional não existe, o chamador cai
sozinho no caminho `OCR → texto → extração`.

### O parser regex foi removido

A extração passou a ser inteiramente do modelo, devolvendo JSON validado em
`infra/converters/`. Com `OCR_MODE=multimodal` (o padrão hoje), a imagem vai
direto ao Gemini e volta JSON numa **única chamada** — sem etapa de OCR.

### Fallback cruzado

Se o modelo primário falha, `MessageProcessingService` incrementa
`ai_errors_total` e tenta o outro (gemini↔gpt) antes de desistir (bug B7).

## Consequências

**Boas**
- Trocar de fornecedor de OCR é uma variável de ambiente.
- O caminho multimodal eliminou uma chamada e um ponto de falha por foto.
- B6 e B7 fechados: sem layout fixo, com resiliência a falha de modelo.
- O contrato `IMessageProcessor` é o ponto de extensão pronto para um provider
  novo — é por aí que entra a frente F1 (modelo barato via Groq).

**Ruins**
- **O opcional virou assimetria invisível.** Quem escolhe `/ia gpt` perde a
  leitura multimodal sem aviso, e ainda paga o OCR à parte (C11).
- **Os providers de OCR não lançam erro** — devolvem a string
  `"Erro ao processar a imagem."`, que segue para a IA como se fosse o conteúdo
  do cupom. O usuário vê "não entendi" em vez de "falhou o OCR" (C12).
- **Os modelos ficaram hardcoded** em três arquivos, fora da config — justamente
  a variável que mais importa para custo (C13).
- O PaddleOCR nunca saiu do papel: a imagem jamais foi construída (paddlepaddle
  não tem wheel para linux/arm64) (C20).

**Revisitar quando:** ao iniciar a frente F1. A decisão de contrato se sustenta;
o que precisa mudar é levar modelo e provider para a config e resolver a
assimetria do `processImage`.
