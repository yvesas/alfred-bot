import { type ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "./lib/i18n";
import { AuthProvider } from "./features/auth/AuthProvider";

// Renderiza um componente com os provedores do app (i18n, router, auth) — para testes de página.
export function renderWithProviders(ui: ReactElement, route = "/") {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}
