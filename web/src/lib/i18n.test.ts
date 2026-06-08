import { describe, it, expect, vi, afterEach } from "vitest";
import { getLocale, LOCALES, LOCALE_LABELS } from "./i18n";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("i18n", () => {
  it("tem rótulo para cada idioma suportado", () => {
    for (const l of LOCALES) {
      expect(LOCALE_LABELS[l]).toBeTruthy();
    }
  });

  it("lê o idioma salvo no localStorage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "es", setItem: () => {} });
    expect(getLocale()).toBe("es");
  });

  it("usa o idioma do navegador quando não há preferência salva", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(getLocale()).toBe("en");
  });

  it("cai em pt para idiomas não suportados", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(getLocale()).toBe("pt");
  });
});
