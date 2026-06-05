import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { MessageList } from "./components/MessageList";
import { ChatInput } from "./components/ChatInput";
import { getTheme, toggleTheme, type Theme } from "../../lib/theme";
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from "../../lib/i18n";
import { linkUrl } from "../../lib/auth";
import { LoginModal } from "../auth/LoginModal";

// Botão de vínculo do WhatsApp só aparece quando há um número de bot configurado.
const WHATSAPP_ENABLED = import.meta.env.VITE_WHATSAPP_ENABLED === "true";

export function ChatPage() {
  const { messages, typing, status, session, sendText, sendPhoto, setLanguage, logout } = useChat();
  const connected = status === "open";
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [loginOpen, setLoginOpen] = useState(false);
  const { locale, setLocale, t } = useI18n();

  const statusLabel = connected
    ? t("status_connected")
    : status === "connecting"
      ? t("status_connecting")
      : t("status_offline");

  const onLocaleChange = (l: Locale) => {
    setLocale(l);
    // Avisa o bot para responder no novo idioma (reusa /idioma).
    if (connected) setLanguage(l);
  };

  return (
    <div className="flex h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <h1 className="text-base font-semibold">Alfred</h1>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span
                className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {statusLabel}
            </span>

            <select
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as Locale)}
              title={t("language_label")}
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
              title={t("toggle_theme")}
              aria-label={t("toggle_theme")}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
                {session.name ? `${session.name.split(" ")[0]} · ` : ""}
                {t("logout")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                {t("login")}
              </button>
            )}
          </div>
        </div>
      </header>

      {session && (
        <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <div className="mx-auto flex max-w-2xl items-center gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">🔗</span>
            <a
              target="_blank"
              rel="noreferrer"
              href={linkUrl("telegram")}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("link_telegram")}
            </a>
            {WHATSAPP_ENABLED && (
              <a
                target="_blank"
                rel="noreferrer"
                href={linkUrl("whatsapp")}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t("link_whatsapp")}
              </a>
            )}
          </div>
        </div>
      )}

      <MessageList messages={messages} typing={typing} />
      <ChatInput disabled={!connected} onSendText={sendText} onSendPhoto={sendPhoto} />

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
