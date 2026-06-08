import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../lib/i18n";
import { LoginModal } from "./LoginModal";

describe("LoginModal", () => {
  beforeEach(() => {
    localStorage.setItem("alfred:locale", "pt"); // determinístico (evita idioma do navegador)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt" }) }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("avança da etapa de e-mail para a etapa do código", async () => {
    render(
      <I18nProvider>
        <LoginModal onClose={() => {}} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText("seu@email.com"), {
      target: { value: "maria@exemplo.com" },
    });
    fireEvent.click(screen.getByText("Enviar código"));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Código de 6 dígitos")).toBeInTheDocument(),
    );
    expect(screen.getByText(/maria@exemplo.com/)).toBeInTheDocument();
  });

  it("fecha ao clicar no X", () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <LoginModal onClose={onClose} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalled();
  });
});
