import "reflect-metadata";
import { GeminiProcessor } from "../services/GeminiProcessor";
import { GeminiOcrProvider } from "../services/ocr/GeminiOcrProvider";
import { config } from "../infra/config";

// O CI do bot estava vermelho desde junho por causa disto: o construtor destas duas
// classes criava o cliente `VertexAI` avidamente, e o `VertexAI` estoura quando não
// consegue inferir o projeto. O runner não tem credencial de GCP, então quebrava —
// e a máquina local passava, porque o `.env` do dev tem `GCP_PROJECT_ID`.
//
// Não era só problema de teste: o container instancia os dois mesmo quando o usuário
// escolheu GPT ou `OCR_PROVIDER=paddle`, então faltar configuração de GCP derrubava o
// startup de quem nem usa Gemini.
describe("cliente Vertex é preguiçoso", () => {
  const original = config.gcpProjectId;

  beforeEach(() => {
    // Exatamente o cenário do CI e de quem não usa Gemini.
    config.gcpProjectId = "";
  });

  afterEach(() => {
    config.gcpProjectId = original;
  });

  it("GeminiProcessor constrói sem projeto configurado", () => {
    expect(() => new GeminiProcessor()).not.toThrow();
  });

  it("GeminiOcrProvider constrói sem projeto configurado", () => {
    expect(() => new GeminiOcrProvider()).not.toThrow();
  });

  // A contrapartida: quem realmente usa recebe o erro, só que na hora do uso — onde
  // há um `catch` que sabe responder — em vez de na carga do processo.
  it("mas estoura ao usar, quando o projeto não está configurado", async () => {
    const processor = new GeminiProcessor();

    await expect(processor.processMessage("agua 7")).rejects.toThrow(/project/i);
  });
});
