import { OpenAI } from "openai";
import { IMessageProcessor, ModelResponse } from "./MessageProcessingService";
import { getPrompt001 } from "../IA/prompts";
import { validateAndConvertModelResponse } from "../infra/converters/modelResponseConverter";

export class GptProcessor implements IMessageProcessor {
  private ai: OpenAI;
  private model: string;

  constructor() {
    this.model = "gpt-4-turbo";
    this.ai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async processMessage(message: string): Promise<ModelResponse | null> {
    const prompt = getPrompt001(null, message);

    const completion = await this.ai.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    try {
      return validateAndConvertModelResponse(completion.choices[0].message.content || "");
    } catch (error) {
      console.error("Erro ao processar resposta da IA:", error);
      return { intent: "other", message: "🤖 Não consegui interpretar a mensagem." };
    }
  }
}
