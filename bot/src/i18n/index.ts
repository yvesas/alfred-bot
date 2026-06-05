import { Language } from "../models/User";

// Catálogo de mensagens fixas do bot por idioma. Vai crescer conforme migramos as
// strings de respostas (hoje ainda há várias hardcoded em PT no BotCore/UserService).
type Key = "language_set" | "language_usage";

const MESSAGES: Record<Language, Record<Key, string>> = {
  pt: {
    language_set: "✅ Idioma definido para Português.",
    language_usage: "Use: /idioma pt | en | es",
  },
  en: {
    language_set: "✅ Language set to English.",
    language_usage: "Use: /idioma pt | en | es",
  },
  es: {
    language_set: "✅ Idioma configurado a Español.",
    language_usage: "Use: /idioma pt | en | es",
  },
};

export function t(lang: Language, key: Key): string {
  return MESSAGES[lang]?.[key] ?? MESSAGES.pt[key];
}

// Idioma (código) → rótulo para o prompt da IA.
const LANG_LABEL: Record<Language, string> = {
  pt: "português do Brasil",
  en: "English",
  es: "Español",
};

export function languageLabel(lang: Language): string {
  return LANG_LABEL[lang] ?? LANG_LABEL.pt;
}
