// Formatação leve para o painel/relatórios.
export function money(n: number, locale: string): string {
  const symbol = locale === "pt" ? "R$" : "$";
  return `${symbol} ${n.toFixed(2)}`;
}

export function monthLabel(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${String(year).slice(2)}`;
}
