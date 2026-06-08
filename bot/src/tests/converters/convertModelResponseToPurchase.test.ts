/* eslint-disable @typescript-eslint/no-explicit-any */

import { convertModelResponseToPurchase } from "../../infra/converters/purchaseConverter";
import { IPurchaseCreate } from "../../models/Purchase";
import { ModelResponse } from "../../services/MessageProcessingService";
import { accessKeyCheckDigit } from "../../utils/fiscalKey";

describe("convertModelResponseToPurchase", () => {
  it("should correctly convert a valid ModelResponse to IPurchaseCreate", () => {
    const date = new Date("2024-05-26T10:00:00.000Z");
    const input: ModelResponse = {
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: date,
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
          category: "Test Category",
        },
      ],
    };

    const expectedOutput: IPurchaseCreate = {
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: date,
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
          category: "Test Category",
        },
      ],
    };

    const result = convertModelResponseToPurchase(input);
    expect(result).toEqual(expectedOutput);
  });

  it("should handle invalid date and use current date", () => {
    const input: ModelResponse = {
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: new Date("invalid-date"),
      items: [],
    };
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = convertModelResponseToPurchase(input);
    expect(result.date).toBeInstanceOf(Date);
    expect(isNaN(result.date.getTime())).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  it("should handle missing store and set it to undefined", () => {
    const date = new Date("2024-05-26T10:00:00.000Z");
    const input: ModelResponse = {
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: date,
      items: [],
    };

    const result = convertModelResponseToPurchase(input);
    expect(result.store).toBeUndefined();
  });

  it("should handle missing items and set it to an empty array", () => {
    const date = new Date("2024-05-26T10:00:00.000Z");
    const input: any = {
      intent: "purchase",
      userId: "123",
      description: "Test Purchase",
      total: 100,
      date: date,
    };

    const result = convertModelResponseToPurchase(input);
    expect(result.items).toEqual([]);
  });

  it("aceita uma chave de acesso válida e deriva o CNPJ da loja", () => {
    const base43 = "35" + "2406" + "12345678000199" + "65" + "001" + "000000123" + "1" + "00000012";
    const key = base43 + String(accessKeyCheckDigit(base43));
    const input: any = { intent: "purchase", userId: "1", total: 10, accessKey: key };

    const result = convertModelResponseToPurchase(input);
    expect(result.fiscalKey).toBe(key);
    expect(result.store?.cnpj).toBe("12345678000199"); // derivado da chave
  });

  it("ignora uma chave de acesso inválida (DV errado)", () => {
    const input: any = {
      intent: "purchase",
      userId: "1",
      total: 10,
      accessKey: "0".repeat(43) + "5",
    };
    const result = convertModelResponseToPurchase(input);
    expect(result.fiscalKey).toBeUndefined();
  });
});
