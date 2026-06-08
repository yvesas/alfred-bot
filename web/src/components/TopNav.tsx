import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from "../lib/i18n";
import { useAuth } from "../features/auth/AuthProvider";

// Cabeçalho/nav compartilhado por todas as páginas (marca, rotas, idioma, tema, login).
export function TopNav() {
  const { t, locale, setLocale } = useI18n();
  const { session, openLogin, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(getTheme());

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-2 py-1 ${
      isActive
        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
    }`;

  return (
    <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <Link to="/" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Alfred
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <NavLink to="/chat" className={linkClass}>
            {t("nav_chat")}
          </NavLink>
          {session && (
            <NavLink to="/painel" className={linkClass}>
              {t("nav_dashboard")}
            </NavLink>
          )}
          {session && (
            <NavLink to="/conta" className={linkClass}>
              {t("nav_account")}
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label={t("language_label")}
            className="rounded-lg border border-zinc-200 bg-transparent px-1.5 py-1 text-xs text-zinc-600 outline-none hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l} className="bg-white dark:bg-zinc-900">
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setTheme(toggleTheme())}
            aria-label={t("toggle_theme")}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {session ? (
            <button
              type="button"
              onClick={logout}
              title={session.email ?? session.name ?? ""}
              className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("logout")}
            </button>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              {t("login")}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
