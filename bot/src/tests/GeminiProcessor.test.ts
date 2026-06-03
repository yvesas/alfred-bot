/* eslint-disable @typescript-eslint/no-explicit-any */
import { GeminiProcessor } from "../services/GeminiProcessor";
import { ModelResponse } from "../services/MessageProcessingService";
import { VertexAI } from "@google-cloud/vertexai";
import sinon from "sinon";
import * as modelResponseConverter from "../infra/converters/modelResponseConverter";

describe("GeminiProcessor", () => {
  let geminiProcessor: GeminiProcessor;
  let vertexAIStub: sinon.SinonStubbedInstance<VertexAI>;
  let modelStub: any;
  let validateAndConvertModelResponseStub: sinon.SinonStub;

  beforeEach(() => {
    vertexAIStub = sinon.createStubInstance(VertexAI);
    modelStub = {
      generateContent: sinon.stub(),
    };
    vertexAIStub.getGenerativeModel.returns(modelStub);

    process.env.GCP_PROJECT_ID = "test-project";

    geminiProcessor = new GeminiProcessor();
    (geminiProcessor as any).vertexAI = vertexAIStub;
    (geminiProcessor as any).model = modelStub;

    // Stub validateAndConvertModelResponse
    validateAndConvertModelResponseStub = sinon.stub(
      modelResponseConverter,
      "validateAndConvertModelResponse",
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should process a message and pass the response to validateAndConvertModelResponse", async () => {
    const message = "Test message";
    const geminiResponseText =
      '{"intent":"purchase","userId":"123","description":"test","total":100,"date":"2024-05-26T10:00:00.000Z","items":[]}';
    const expectedModelResponse: ModelResponse = {
      intent: "purchase",
      userId: "123",
      description: "test",
      total: 100,
      date: new Date("2024-05-26T10:00:00.000Z"),
      items: [],
    };

    modelStub.generateContent.resolves({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: geminiResponseText }],
            },
          },
        ],
      },
    });

    validateAndConvertModelResponseStub.returns(expectedModelResponse);

    const result = await geminiProcessor.processMessage(message);

    // expect(modelStub.generateContent.calledOnce).toBe(true);
    // expect(validateAndConvertModelResponseStub.calledOnce).toBe(true);
    // expect(validateAndConvertModelResponseStub.calledWith(geminiResponseText)).toBe(true);
    expect(result).toEqual(expectedModelResponse);
  });

  it("should handle Gemini error and throw an error", async () => {
    const message = "Test message";
    modelStub.generateContent.rejects(new Error("Gemini error"));

    await expect(geminiProcessor.processMessage(message)).rejects.toThrow("Gemini error");
  });

  it("processImage should read the image and return the parsed response", async () => {
    const expectedModelResponse: ModelResponse = {
      intent: "purchase",
      userId: "123",
      description: "cupom",
      total: 7,
      date: new Date("2024-05-26T10:00:00.000Z"),
      items: [],
    };

    modelStub.generateContent.resolves({
      response: {
        candidates: [{ content: { parts: [{ text: '{"intent":"purchase"}' }] } }],
      },
    });
    validateAndConvertModelResponseStub.returns(expectedModelResponse);

    const result = await geminiProcessor.processImage("base64-da-imagem");

    expect(result).toEqual(expectedModelResponse);
    expect(modelStub.generateContent.calledOnce).toBe(true);
  });
});
