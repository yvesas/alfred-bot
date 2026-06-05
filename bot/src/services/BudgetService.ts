import { inject, injectable } from "inversify";
import { UserService } from "./UserService";
import { PurchaseService } from "./PurchaseService";
import { Platform } from "../core/IncomingMessage";
import { IPurchaseCreate } from "../models/Purchase";

// Limiares de alerta (fração do orçamento mensal).
const WARN_RATIO = 0.8;

@injectable()
export class BudgetService {
  constructor(
    @inject(UserService) private userService: UserService,
    @inject(PurchaseService) private purchaseService: PurchaseService,
  ) {}

  // Alertas de orçamento disparados por uma compra recém-salva. Só avalia as categorias
  // tocadas pela compra (evita repetir alertas de categorias não relacionadas).
  async alertsForPurchase(
    platform: Platform,
    externalId: string,
    purchase: IPurchaseCreate,
  ): Promise<string[]> {
    const budgets = await this.userService.getBudgets(platform, externalId);
    if (budgets.length === 0) return [];

    const touched = new Set(
      (purchase.items ?? [])
        .map((i) => i.category?.trim().toLowerCase())
        .filter((c): c is string => !!c),
    );
    // Compra sem categoria nos itens cai em "Outros" (mesma convenção do relatório de gastos).
    if (touched.size === 0) touched.add("outros");

    const relevant = budgets.filter((b) => touched.has(b.category.toLowerCase()));
    if (relevant.length === 0) return [];

    // userId das compras = externalId da plataforma.
    const report = await this.purchaseService.getSpendingReport(externalId, "current_month");

    const alerts: string[] = [];
    for (const b of relevant) {
      if (b.limit <= 0) continue;
      const spent = this.spentFor(report.byCategory, b.category);
      const ratio = spent / b.limit;
      const pct = Math.round(ratio * 100);

      if (ratio >= 1) {
        alerts.push(
          `🚨 Orçamento de ${b.category} estourado: R$ ${spent.toFixed(2)} de R$ ${b.limit.toFixed(2)} (${pct}%).`,
        );
      } else if (ratio >= WARN_RATIO) {
        alerts.push(
          `🔔 Você já usou ${pct}% do orçamento de ${b.category}: R$ ${spent.toFixed(2)} de R$ ${b.limit.toFixed(2)}.`,
        );
      }
    }
    return alerts;
  }

  // Soma os gastos da categoria no relatório, casando de forma case-insensitive.
  private spentFor(byCategory: Record<string, number>, category: string): number {
    const target = category.toLowerCase();
    return Object.entries(byCategory)
      .filter(([k]) => k.toLowerCase() === target)
      .reduce((sum, [, v]) => sum + v, 0);
  }
}
