import "reflect-metadata";
import { config } from "../infra/config";

// C0 — o `gemini-2.0-flash-lite-001` estava hardcoded em dois arquivos e foi desligado no
// Vertex AI em 2026-06-01. O bot parou de processar mensagem e ninguém viu, porque o
// fallback cruzado caía num `gpt-4-turbo` que também está de saída (2026-10-23).
//
// Estes testes não checam se o modelo existe lá fora — nenhum teste offline consegue.
// Eles travam a lição: id de modelo é configuração, e nenhum modelo já aposentado pode
// voltar a ser o default silenciosamente.

// Modelos que sabidamente já foram desligados pelos fornecedores. Ao descobrir outro,
// acrescente aqui — é o registro de aposentadorias do projeto.
const RETIRED_MODELS = [
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-0613",
  "gpt-4",
];

describe("configuração de modelos de IA", () => {
  it("expõe modelo, região e visão como configuração", () => {
    expect(config.geminiModel).toBeTruthy();
    expect(config.geminiLocation).toBeTruthy();
    expect(config.geminiVisionModel).toBeTruthy();
    expect(config.openaiModel).toBeTruthy();
  });

  it("não usa nenhum modelo já aposentado como default", () => {
    for (const model of [config.geminiModel, config.geminiVisionModel, config.openaiModel]) {
      expect(RETIRED_MODELS).not.toContain(model);
    }
  });

  it("deixa o modelo de visão seguir o de texto quando não é definido à parte", () => {
    // Sem GEMINI_VISION_MODEL no ambiente, os dois apontam para o mesmo modelo:
    // uma variável a menos para esquecer de atualizar na próxima aposentadoria.
    if (!process.env.GEMINI_VISION_MODEL) {
      expect(config.geminiVisionModel).toBe(config.geminiModel);
    }
  });
});
