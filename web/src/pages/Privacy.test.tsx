import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { Privacy } from "./Privacy";

describe("Privacy", () => {
  beforeEach(() => localStorage.setItem("alfred:locale", "pt"));
  afterEach(() => localStorage.clear());

  it("renderiza a política com os direitos do titular", () => {
    renderWithProviders(<Privacy />, "/privacidade");
    expect(
      screen.getByRole("heading", { name: "Política de Privacidade", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/excluir_conta/)).toBeInTheDocument();
  });
});
