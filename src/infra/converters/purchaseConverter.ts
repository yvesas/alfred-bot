import { IPurchaseCreate, IStoreInfo } from "../../models/Purchase";
import { ModelResponse } from "../../services/MessageProcessingService";

export function convertModelResponseToPurchase(input: ModelResponse): IPurchaseCreate {
  let parsedDate: Date;

  if (input.date) {
    parsedDate = new Date(input.date);
    if (isNaN(parsedDate.getTime())) {
      console.warn(`Data inválida recebida: ${input.date}. Usando data atual.`);
      parsedDate = new Date();
    }
  } else {
    parsedDate = new Date();
  }

  if (input.store) {
    const storeInfo: IStoreInfo = {
      name: input.store.name,
      cnpj: input.store.cnpj,
    };
    input.store = storeInfo;
  }

  return {
    userId: input.userId ?? "",
    description: input.description ?? "Compra",
    total: input.total ?? 0,
    date: parsedDate,
    store: input.store,
    tax: input.tax,
    items: input.items || [],
  };
}
