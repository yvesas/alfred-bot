/* eslint-disable @typescript-eslint/no-explicit-any */
import { ModelResponse } from "../../services/MessageProcessingService";
import { ValidationError } from "../../utils/errors";

export function validateAndConvertModelResponse(jsonString: string): ModelResponse {
  try {
    if (!jsonString || jsonString.trim() === "") {
      throw new ValidationError("Empty JSON.");
    }

    jsonString = jsonString.replace(/```(json)?/g, "");

    let parsedObject: any;
    try {
      parsedObject = JSON.parse(jsonString);
    } catch (parseError: Error | any) {
      throw new ValidationError(`Error parsing JSON: ${parseError}`);
    }

    if (!parsedObject.intent) {
      throw new ValidationError("Invalid JSON: missing intent.");
    }

    // Apenas compras carregam dados de recibo. Demais intenções (query/other/unknown)
    // retornam cedo, sem exigir os campos de compra.
    if (parsedObject.intent !== "purchase") {
      return {
        intent: parsedObject.intent,
        message: parsedObject.message,
        period: parsedObject.period,
        groupBy: parsedObject.groupBy,
      };
    }

    if (
      !parsedObject.description ||
      typeof parsedObject.total !== "number" ||
      !parsedObject.date ||
      !parsedObject.items
    ) {
      throw new ValidationError("Invalid JSON: missing or incorrect fields.");
    }

    const parsedDate = new Date(parsedObject.date);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError(`Invalid date: ${parsedObject.date}`);
    }

    if (!Array.isArray(parsedObject.items)) {
      parsedObject.items = [];
    }

    if (parsedObject.store) {
      if (
        typeof parsedObject.store.name !== "string" ||
        typeof parsedObject.store.cnpj !== "string"
      ) {
        throw new ValidationError("Invalid JSON: missing or incorrect fields in store object.");
      }
    }

    if (parsedObject.tax) {
      if (
        typeof parsedObject.tax.federal !== "number" ||
        typeof parsedObject.tax.state !== "number" ||
        typeof parsedObject.tax.icms !== "number"
      ) {
        throw new ValidationError("Invalid JSON: missing or incorrect fields in tax object.");
      }
    }

    const modelResponse: ModelResponse = {
      intent: parsedObject.intent,
      message: parsedObject.message,
      userId: parsedObject.userId,
      description: parsedObject.description,
      total: parsedObject.total,
      date: parsedDate,
      store: parsedObject.store,
      tax: parsedObject.tax,
      items: parsedObject.items,
    };

    return modelResponse;
  } catch (error: Error | any) {
    if (error instanceof ValidationError) {
      throw error; // Re-lançar o ValidationError
    } else {
      throw new ValidationError("Error processing model response."); // Lançar um novo ValidationError
    }
  }
}
