import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { Dashboard } from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    localStorage.setItem("alfred:locale", "pt");
  });
  afterEach(() => localStorage.clear());

  it("pede login quando o usuário não está autenticado", () => {
    renderWithProviders(<Dashboard />, "/painel");
    expect(screen.getByText(/Entre para ver seu painel/)).toBeInTheDocument();
  });
});
