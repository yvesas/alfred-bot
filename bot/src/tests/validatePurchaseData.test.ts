import { validatePurchaseData } from "../infra/converters/purchaseConverter";
import { IPurchaseCreate } from "../models/Purchase";

const base: IPurchaseCreate = {
  userId: "1",
  description: "Compra",
  total: 10,
  date: new Date(),
  items: [],
};

describe("validatePurchaseData", () => {
  it("accepts a valid purchase", () => {
    expect(validatePurchaseData(base).ok).toBe(true);
  });

  it("rejects a non-positive total", () => {
    expect(validatePurchaseData({ ...base, total: 0 }).ok).toBe(false);
  });

  it("rejects an absurdly high total", () => {
    expect(validatePurchaseData({ ...base, total: 99_000_000 }).ok).toBe(false);
  });

  it("rejects an empty description", () => {
    expect(validatePurchaseData({ ...base, description: "   " }).ok).toBe(false);
  });

  it("rejects items with invalid numbers", () => {
    const result = validatePurchaseData({
      ...base,
      items: [{ description: "x", quantity: NaN, unitPrice: 1, total: 1 }],
    });
    expect(result.ok).toBe(false);
  });
});
