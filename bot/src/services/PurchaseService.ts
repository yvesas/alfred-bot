import { inject, injectable } from "inversify";
import { PurchaseRepository, SpendingSummary } from "../repositories/PurchaseRepository";
import { IPurchase, IPurchaseCreate } from "../models/Purchase";
import { SpendingPeriod } from "./MessageProcessingService";
import { purchasesRegisteredTotal } from "../infra/metrics";

export interface SpendingReport extends SpendingSummary {
  period: SpendingPeriod;
}

@injectable()
export class PurchaseService {
  constructor(@inject(PurchaseRepository) private purchaseRepo: PurchaseRepository) {}

  async addPurchase(purchase: IPurchaseCreate): Promise<IPurchase> {
    if (purchase.total <= 0) {
      throw new Error("Invalid purchase data");
    }
    const created = await this.purchaseRepo.create(purchase);
    purchasesRegisteredTotal.inc();
    return created;
  }

  async getUserPurchases(userId: string): Promise<IPurchase[]> {
    return await this.purchaseRepo.findByUser(userId);
  }

  async deletePurchase(userId: string, id: string): Promise<IPurchase | null> {
    return await this.purchaseRepo.deleteById(userId, id);
  }

  async updatePurchase(
    userId: string,
    id: string,
    patch: Partial<IPurchaseCreate>,
  ): Promise<IPurchase | null> {
    return await this.purchaseRepo.updateById(userId, id, patch);
  }

  async getTotalSpent(userId: string, month: number, year: number): Promise<number> {
    return await this.purchaseRepo.getTotalSpent(userId, month, year);
  }

  // Relatório de gastos por período (mês atual, mês passado ou histórico completo).
  async getSpendingReport(
    userId: string,
    period: SpendingPeriod = "current_month",
  ): Promise<SpendingReport> {
    const { start, end } = this.resolvePeriod(period);
    const summary = await this.purchaseRepo.getSpendingSummary(userId, start, end);
    return { ...summary, period };
  }

  private resolvePeriod(period: SpendingPeriod): { start?: Date; end?: Date } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based

    switch (period) {
      case "current_month":
        return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
      case "last_month":
        return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
      case "all":
      default:
        return {};
    }
  }
}
