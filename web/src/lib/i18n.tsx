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
  | "language_label"
  | "login"
  | "logout"
  | "link_telegram"
  | "link_whatsapp"
  | "login_title"
  | "login_email_placeholder"
  | "login_send_code"
  | "login_code_placeholder"
  | "login_verify"
  | "login_back"
  | "login_code_sent"
  | "login_error";

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
    login: "Entrar",
    logout: "Sair",
    link_telegram: "Vincular Telegram",
    link_whatsapp: "Vincular WhatsApp",
    login_title: "Entrar",
    login_email_placeholder: "seu@email.com",
    login_send_code: "Enviar código",
    login_code_placeholder: "Código de 6 dígitos",
    login_verify: "Entrar",
    login_back: "Voltar",
    login_code_sent: "Enviamos um código para",
    login_error: "Algo deu errado. Tente novamente.",
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
    login: "Sign in",
    logout: "Sign out",
    link_telegram: "Link Telegram",
    link_whatsapp: "Link WhatsApp",
    login_title: "Sign in",
    login_email_placeholder: "you@email.com",
    login_send_code: "Send code",
    login_code_placeholder: "6-digit code",
    login_verify: "Sign in",
    login_back: "Back",
    login_code_sent: "We sent a code to",
    login_error: "Something went wrong. Please try again.",
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
    login: "Entrar",
    logout: "Salir",
    link_telegram: "Vincular Telegram",
    link_whatsapp: "Vincular WhatsApp",
    login_title: "Entrar",
    login_email_placeholder: "tu@email.com",
    login_send_code: "Enviar código",
    login_code_placeholder: "Código de 6 dígitos",
    login_verify: "Entrar",
    login_back: "Volver",
    login_code_sent: "Enviamos un código a",
    login_error: "Algo salió mal. Inténtalo de nuevo.",
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
