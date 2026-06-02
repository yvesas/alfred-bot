import "reflect-metadata";
import { injectable } from "inversify";
import { PurchaseModel, IPurchase, IPurchaseCreate } from "../models/Purchase";

export interface SpendingSummary {
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byStore: Record<string, number>;
}

@injectable()
export class PurchaseRepository {
  async create(purchase: IPurchaseCreate): Promise<IPurchase> {
    return await PurchaseModel.create(purchase);
  }

  async findByUser(userId: string): Promise<IPurchase[]> {
    return await PurchaseModel.find({ userId }).sort({ date: -1 }).exec();
  }

  async getTotalSpent(userId: string, month: number, year: number): Promise<number> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const purchases = await PurchaseModel.find({ userId, date: { $gte: start, $lt: end } });
    return purchases.reduce((total, p) => total + p.total, 0);
  }

  // Resumo de gastos no intervalo informado. Sem start/end considera todo o histórico.
  async getSpendingSummary(userId: string, start?: Date, end?: Date): Promise<SpendingSummary> {
    const query: Record<string, unknown> = { userId };
    if (start || end) {
      query.date = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lt: end } : {}),
      };
    }

    const purchases = await PurchaseModel.find(query).exec();

    const summary: SpendingSummary = {
      total: 0,
      count: purchases.length,
      byCategory: {},
      byStore: {},
    };

    for (const purchase of purchases) {
      summary.total += purchase.total;

      const storeName = purchase.store?.name?.trim() || "Sem loja";
      summary.byStore[storeName] = (summary.byStore[storeName] || 0) + purchase.total;

      if (purchase.items && purchase.items.length > 0) {
        for (const item of purchase.items) {
          const category = item.category?.trim() || "Outros";
          summary.byCategory[category] = (summary.byCategory[category] || 0) + item.total;
        }
      } else {
        summary.byCategory["Outros"] = (summary.byCategory["Outros"] || 0) + purchase.total;
      }
    }

    return summary;
  }
}
