import { IUser, Language } from "../models/User";

// Formatação compartilhada entre o BotCore e os módulos. Vive fora dos dois porque
// idioma e moeda não pertencem a nenhuma capacidade em particular.

/** Idioma do usuário (default "pt") — usado para localizar as respostas fixas do bot. */
export function langOf(user: Pick<IUser, "language"> | null | undefined): Language {
  return user?.language ?? "pt";
}

/** Símbolo de moeda por idioma (pt usa R$; en/es usam $ neste MVP). */
export function currency(lang: Language): string {
  return lang === "pt" ? "R$" : "$";
}
