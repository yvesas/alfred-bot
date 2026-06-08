import { describe, it, expect } from "vitest";
import { money, monthLabel } from "./format";

describe("format", () => {
  it("money usa R$ em pt e $ nos demais idiomas", () => {
    expect(money(10.5, "pt")).toBe("R$ 10.50");
    expect(money(10.5, "en")).toBe("$ 10.50");
    expect(money(0, "es")).toBe("$ 0.00");
  });

  it("monthLabel formata MM/YY", () => {
    expect(monthLabel(2026, 6)).toBe("06/26");
    expect(monthLabel(2025, 12)).toBe("12/25");
  });
});
