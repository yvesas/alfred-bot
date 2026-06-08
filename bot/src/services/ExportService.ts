import { inject, injectable } from "inversify";
import { PurchaseService } from "./PurchaseService";

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

// Exportação de dados do usuário (CSV). Uma linha por compra.
@injectable()
export class ExportService {
  constructor(@inject(PurchaseService) private purchaseService: PurchaseService) {}

  async purchasesCsv(userId: string): Promise<string> {
    const purchases = await this.purchaseService.getUserPurchases(userId);
    const header = ["Data", "Descrição", "Total", "Loja", "Categorias", "Chave"];
    const rows = purchases.map((p) => [
      p.date.toISOString().slice(0, 10),
      p.description,
      p.total.toFixed(2),
      p.store?.name ?? "",
      [...new Set((p.items ?? []).map((i) => i.category).filter(Boolean))].join("; "),
      p.fiscalKey ?? "",
    ]);
    return toCsv([header, ...rows]);
  }
}
