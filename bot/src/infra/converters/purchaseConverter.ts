import { IPurchaseCreate, IStoreInfo } from "../../models/Purchase";
import { ModelResponse } from "../../services/MessageProcessingService";
import { isValidAccessKey, parseAccessKey } from "../../utils/fiscalKey";
import { MessageKey } from "../../i18n";
import { logger } from "../logger";

export function convertModelResponseToPurchase(input: ModelResponse): IPurchaseCreate {
  let parsedDate: Date;

  if (input.date) {
    parsedDate = new Date(input.date);
    if (isNaN(parsedDate.getTime())) {
      logger.warn(`Data inválida recebida: ${input.date}. Usando data atual.`);
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

  // Chave de acesso da NFC-e: só aceita se for válida (DV mód-11). Enriquece a loja com o
  // CNPJ derivado da chave quando a IA não trouxe um.
  const fiscalKey =
    input.accessKey && isValidAccessKey(input.accessKey) ? input.accessKey : undefined;
  let store = input.store;
  if (fiscalKey) {
    const info = parseAccessKey(fiscalKey);
    if (info && !store?.cnpj) {
      store = { name: store?.name ?? "", cnpj: info.cnpj };
    }
  }

  return {
    userId: input.userId ?? "",
    description: input.description ?? "Compra",
    total: input.total ?? 0,
    date: parsedDate,
    store,
    tax: input.tax,
    items: input.items || [],
    ...(fiscalKey ? { fiscalKey } : {}),
  };
}

export type PurchaseValidation = { ok: true } | { ok: false; reason: MessageKey };

// Validação programática dos dados extraídos pela IA antes de persistir — rejeita
// valores implausíveis (não é a confirmação de UX).
//
// Devolve a CHAVE da mensagem, não o texto: quem responde é quem sabe o idioma do
// usuário. Antes devolvia português cru, então quem usava o bot em `en`/`es` recebia
// a recusa em português — num projeto cujo catálogo é tipado justamente para impedir
// isso (C15).
export function validatePurchaseData(data: IPurchaseCreate): PurchaseValidation {
  if (!Number.isFinite(data.total) || data.total <= 0) {
    return { ok: false, reason: "purchase_invalid_total" };
  }
  if (data.total > 10_000_000) {
    return { ok: false, reason: "purchase_total_too_high" };
  }
  if (!data.description || data.description.trim().length === 0) {
    return { ok: false, reason: "purchase_missing_description" };
  }
  for (const item of data.items ?? []) {
    if (
      !Number.isFinite(item.total) ||
      !Number.isFinite(item.quantity) ||
      !Number.isFinite(item.unitPrice)
    ) {
      return { ok: false, reason: "purchase_invalid_items" };
    }
  }
  return { ok: true };
}
