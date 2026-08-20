import "reflect-metadata";
import { validatePurchaseData } from "../infra/converters/purchaseConverter";
import { IPurchaseCreate } from "../models/Purchase";
import { t } from "../i18n";
import { Language } from "../models/User";

// C15 — a validação da compra devolvia português cru, e o BotCore respondia
// `❌ ${reason}`. Usuário em `en`/`es` recebia português, num projeto cujo catálogo é
// tipado justamente para impedir isso.

const LANGS: Language[] = ["pt", "en", "es"];

const purchase = (over: Partial<IPurchaseCreate> = {}): IPurchaseCreate =>
  ({
    userId: "u1",
    description: "Mercado",
    total: 90,
    date: new Date(),
    items: [],
    ...over,
  }) as IPurchaseCreate;

describe("validatePurchaseData devolve chave, não texto (C15)", () => {
  it("aceita uma compra plausível", () => {
    expect(validatePurchaseData(purchase())).toEqual({ ok: true });
  });

  const casos: Array<[string, IPurchaseCreate, string]> = [
    ["total ausente ou zero", purchase({ total: 0 }), "purchase_invalid_total"],
    ["total não numérico", purchase({ total: NaN }), "purchase_invalid_total"],
    ["total implausível", purchase({ total: 20_000_000 }), "purchase_total_too_high"],
    ["descrição vazia", purchase({ description: "   " }), "purchase_missing_description"],
    [
      "item com valor inválido",
      purchase({ items: [{ description: "x", quantity: 1, unitPrice: NaN, total: 1 }] }),
      "purchase_invalid_items",
    ],
  ];

  it.each(casos)("recusa %s com a chave certa", (_nome, data, chave) => {
    const result = validatePurchaseData(data);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe(chave);
  });

  // O que o C15 realmente conserta: a recusa sai no idioma da pessoa.
  it.each(casos)("a recusa de %s existe nos três idiomas", (_nome, data) => {
    const result = validatePurchaseData(data);
    if (result.ok) throw new Error("esperava recusa");

    for (const lang of LANGS) {
      const message = t(lang, result.reason);
      expect(message).toBeTruthy();
      expect(message).not.toContain("{"); // sem placeholder solto
    }
  });

  it("as três traduções são realmente diferentes entre si", () => {
    const result = validatePurchaseData(purchase({ total: 0 }));
    if (result.ok) throw new Error("esperava recusa");

    const [pt, en, es] = LANGS.map((l) => t(l, result.reason));
    expect(new Set([pt, en, es]).size).toBe(3);
  });
});

describe("recusa de contato de terceiro é localizada (C15)", () => {
  it("existe nos três idiomas e são distintas", () => {
    const mensagens = LANGS.map((l) => t(l, "contact_not_yours"));

    expect(mensagens.every(Boolean)).toBe(true);
    expect(new Set(mensagens).size).toBe(3);
  });
});
