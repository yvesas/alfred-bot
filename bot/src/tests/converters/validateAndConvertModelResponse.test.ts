import { validateAndConvertModelResponse } from "../../infra/converters/modelResponseConverter";
import { ValidationError } from "../../utils/errors";

describe("validateAndConvertModelResponse", () => {
  it("should correctly convert a valid JSON string to ModelResponse", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "2024-05-26T10:00:00.000Z",
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });

    const result = validateAndConvertModelResponse(jsonString);

    expect(result).toEqual({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: new Date("2024-05-26T10:00:00.000Z"),
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });
  });

  it("should handle missing required fields and throw a ValidationError", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      // date missing
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(
      "Invalid JSON: missing or incorrect fields.",
    );
  });

  it("should handle invalid date format and throw a ValidationError", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "invalid-date",
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow("Invalid date: invalid-date");
  });

  it("should handle missing store fields and throw a ValidationError", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "2024-05-26T10:00:00.000Z",
      store: {
        name: "Test Store",
        // cnpj missing
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(
      "Invalid JSON: missing or incorrect fields in store object.",
    );
  });

  it("should handle missing tax fields and throw a ValidationError", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "2024-05-26T10:00:00.000Z",
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        // icms missing
      },
      items: [
        {
          description: "Item 1",
          quantity: 1,
          unitPrice: 50,
          total: 50,
        },
      ],
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(
      "Invalid JSON: missing or incorrect fields in tax object.",
    );
  });

  it("should handle missing items and set it to empty array", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "2024-05-26T10:00:00.000Z",
      store: {
        name: "Test Store",
        cnpj: "12345678901234",
      },
      tax: {
        federal: 10,
        state: 5,
        icms: 2,
      },
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(
      "Invalid JSON: missing or incorrect fields.",
    );
  });

  it("should return a query intent without requiring purchase fields", () => {
    const jsonString = JSON.stringify({
      intent: "query",
      period: "last_month",
      groupBy: "category",
    });

    const result = validateAndConvertModelResponse(jsonString);

    expect(result).toEqual({
      intent: "query",
      message: undefined,
      period: "last_month",
      groupBy: "category",
    });
  });

  it("should return an unknown intent with its message without throwing", () => {
    const jsonString = JSON.stringify({
      intent: "unknown",
      message: "Não foi possível identificar os dados.",
    });

    const result = validateAndConvertModelResponse(jsonString);

    expect(result.intent).toBe("unknown");
    expect(result.message).toBe("Não foi possível identificar os dados.");
  });

  it("should handle invalid store types and throw a ValidationError", () => {
    const jsonString = JSON.stringify({
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: "2024-05-26T10:00:00.000Z",
      store: {
        name: 123, // Tipo incorreto
        cnpj: "12345678901234",
      },
      items: [],
    });

    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(ValidationError);
    expect(() => validateAndConvertModelResponse(jsonString)).toThrow(
      "Invalid JSON: missing or incorrect fields in store object.",
    );
  });
});
