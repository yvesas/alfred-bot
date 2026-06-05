import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// i18n da UI do chat web. Espelha os idiomas do bot (pt/en/es). As mensagens do bot
// já chegam localizadas (o backend usa User.language); aqui cuidamos só dos rótulos da UI.
export type Locale = "pt" | "en" | "es";
export const LOCALES: Locale[] = ["pt", "en", "es"];

const STORAGE_KEY = "alfred:locale";

type UIKey =
  | "status_connected"
  | "status_connecting"
  | "status_offline"
  | "toggle_theme"
  | "send_photo"
  | "input_placeholder"
  | "send"
  | "language_label";

const STRINGS: Record<Locale, Record<UIKey, string>> = {
  pt: {
    status_connected: "conectado",
    status_connecting: "conectando…",
    status_offline: "offline",
    toggle_theme: "Alternar tema",
    send_photo: "Enviar foto de cupom",
    input_placeholder: "Mensagem…",
    send: "Enviar",
    language_label: "Idioma",
  },
  en: {
    status_connected: "connected",
    status_connecting: "connecting…",
    status_offline: "offline",
    toggle_theme: "Toggle theme",
    send_photo: "Send receipt photo",
    input_placeholder: "Message…",
    send: "Send",
    language_label: "Language",
  },
  es: {
    status_connected: "conectado",
    status_connecting: "conectando…",
    status_offline: "sin conexión",
    toggle_theme: "Cambiar tema",
    send_photo: "Enviar foto del recibo",
    input_placeholder: "Mensaje…",
    send: "Enviar",
    language_label: "Idioma",
  },
};

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

function detectDefault(): Locale {
  const lang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "pt";
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("es")) return "es";
  return "pt";
}

export function getLocale(): Locale {
  if (typeof localStorage === "undefined") return detectDefault();
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "pt" || v === "en" || v === "es" ? v : detectDefault();
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (k: UIKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((k: UIKey) => STRINGS[locale][k] ?? STRINGS.pt[k], [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n deve ser usado dentro de <I18nProvider>");
  return ctx;
}
