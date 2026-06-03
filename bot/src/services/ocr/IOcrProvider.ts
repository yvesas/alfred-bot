// Contrato comum a qualquer provedor de OCR (Vision, Gemini, PaddleOCR, ...).
// Permite trocar de provedor por variável de ambiente sem alterar o restante do bot.
export interface IOcrProvider {
  extractTextFromImage(base64Image: string): Promise<string>;
}

// Token de injeção (Inversify) para o IOcrProvider.
export const OCR_PROVIDER_TOKEN = Symbol.for("IOcrProvider");
