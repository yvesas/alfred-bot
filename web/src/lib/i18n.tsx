import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

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
  | "login_error"
  // navegação
  | "nav_chat"
  | "nav_dashboard"
  | "nav_account"
  // landing
  | "landing_tagline"
  | "landing_subtitle"
  | "landing_cta_chat"
  | "plans_title"
  | "plan_free_title"
  | "plan_pro_title"
  | "plan_free_features"
  | "plan_pro_features"
  | "plan_current_badge"
  // painel
  | "dashboard_title"
  | "dashboard_this_month"
  | "dashboard_last_month"
  | "dashboard_by_category"
  | "dashboard_monthly"
  | "dashboard_empty"
  | "dashboard_login_required"
  | "dashboard_purchases"
  // conta
  | "account_title"
  | "account_plan"
  | "account_usage"
  | "account_linked"
  | "account_delete"
  | "account_delete_confirm"
  | "account_delete_warning"
  | "export_csv"
  | "export_pdf"
  | "privacy_policy"
  | "login_consent"
  | "save"
  | "common_loading";

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
    nav_chat: "Chat",
    nav_dashboard: "Painel",
    nav_account: "Conta",
    landing_tagline: "Suas finanças, num chat.",
    landing_subtitle:
      "Registre compras por texto ou foto do cupom. A IA organiza, e você acompanha tudo no painel.",
    landing_cta_chat: "Abrir o chat",
    plans_title: "Planos",
    plan_free_title: "Grátis",
    plan_pro_title: "Pro",
    plan_free_features: "Registro por texto e foto • Gastos e categorias • Até 50 compras/mês",
    plan_pro_features:
      "Tudo do grátis • Compras ilimitadas • Relatórios avançados • Multi-plataforma",
    plan_current_badge: "Seu plano",
    dashboard_title: "Painel",
    dashboard_this_month: "Este mês",
    dashboard_last_month: "Mês passado",
    dashboard_by_category: "Por categoria",
    dashboard_monthly: "Mês a mês",
    dashboard_empty: "Sem gastos registrados ainda.",
    dashboard_login_required: "Entre para ver seu painel.",
    dashboard_purchases: "compras",
    account_title: "Conta",
    account_plan: "Plano",
    account_usage: "Uso no mês",
    account_linked: "Contas vinculadas",
    account_delete: "Excluir minha conta",
    account_delete_confirm: "Tem certeza? Isso apaga todos os seus dados e não dá para desfazer.",
    account_delete_warning: "Apaga compras, lembretes e o cadastro.",
    export_csv: "Exportar CSV",
    export_pdf: "Exportar PDF",
    privacy_policy: "Política de Privacidade",
    login_consent: "Ao entrar, você concorda com a",
    save: "Salvar",
    common_loading: "Carregando…",
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
    nav_chat: "Chat",
    nav_dashboard: "Dashboard",
    nav_account: "Account",
    landing_tagline: "Your finances, in a chat.",
    landing_subtitle:
      "Log purchases by text or receipt photo. AI organizes it, and you track everything in the dashboard.",
    landing_cta_chat: "Open chat",
    plans_title: "Plans",
    plan_free_title: "Free",
    plan_pro_title: "Pro",
    plan_free_features: "Text & photo logging • Spending and categories • Up to 50 purchases/month",
    plan_pro_features:
      "Everything in Free • Unlimited purchases • Advanced reports • Multi-platform",
    plan_current_badge: "Your plan",
    dashboard_title: "Dashboard",
    dashboard_this_month: "This month",
    dashboard_last_month: "Last month",
    dashboard_by_category: "By category",
    dashboard_monthly: "Month by month",
    dashboard_empty: "No spending recorded yet.",
    dashboard_login_required: "Sign in to see your dashboard.",
    dashboard_purchases: "purchases",
    account_title: "Account",
    account_plan: "Plan",
    account_usage: "This month's usage",
    account_linked: "Linked accounts",
    account_delete: "Delete my account",
    account_delete_confirm: "Are you sure? This erases all your data and can't be undone.",
    account_delete_warning: "Erases purchases, reminders and the profile.",
    export_csv: "Export CSV",
    export_pdf: "Export PDF",
    privacy_policy: "Privacy Policy",
    login_consent: "By signing in, you agree to our",
    save: "Save",
    common_loading: "Loading…",
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
    nav_chat: "Chat",
    nav_dashboard: "Panel",
    nav_account: "Cuenta",
    landing_tagline: "Tus finanzas, en un chat.",
    landing_subtitle:
      "Registra compras por texto o foto del recibo. La IA organiza y tú lo ves todo en el panel.",
    landing_cta_chat: "Abrir el chat",
    plans_title: "Planes",
    plan_free_title: "Gratis",
    plan_pro_title: "Pro",
    plan_free_features: "Registro por texto y foto • Gastos y categorías • Hasta 50 compras/mes",
    plan_pro_features:
      "Todo lo del gratis • Compras ilimitadas • Informes avanzados • Multiplataforma",
    plan_current_badge: "Tu plan",
    dashboard_title: "Panel",
    dashboard_this_month: "Este mes",
    dashboard_last_month: "Mes pasado",
    dashboard_by_category: "Por categoría",
    dashboard_monthly: "Mes a mes",
    dashboard_empty: "Aún no hay gastos registrados.",
    dashboard_login_required: "Inicia sesión para ver tu panel.",
    dashboard_purchases: "compras",
    account_title: "Cuenta",
    account_plan: "Plan",
    account_usage: "Uso del mes",
    account_linked: "Cuentas vinculadas",
    account_delete: "Eliminar mi cuenta",
    account_delete_confirm: "¿Seguro? Esto borra todos tus datos y no se puede deshacer.",
    account_delete_warning: "Borra compras, recordatorios y el perfil.",
    export_csv: "Exportar CSV",
    export_pdf: "Exportar PDF",
    privacy_policy: "Política de Privacidad",
    login_consent: "Al entrar, aceptas nuestra",
    save: "Guardar",
    common_loading: "Cargando…",
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
