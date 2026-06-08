import { inject, injectable } from "inversify";
import { PurchaseRepository, SpendingSummary } from "../repositories/PurchaseRepository";
import { IPurchase, IPurchaseCreate } from "../models/Purchase";
import { SpendingPeriod } from "./MessageProcessingService";
import { purchasesRegisteredTotal } from "../infra/metrics";

export interface SpendingReport extends SpendingSummary {
  period: SpendingPeriod;
}

export interface PurchasePage {
  items: IPurchase[];
  total: number;
  page: number; // 1-based
  pages: number;
  pageSize: number;
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

  // Cupom já registrado (dedup por chave de acesso da NFC-e).
  async findByFiscalKey(userId: string, fiscalKey: string): Promise<IPurchase | null> {
    return await this.purchaseRepo.findByFiscalKey(userId, fiscalKey);
  }

  // Histórico paginado (mais recentes primeiro). `page` é 1-based.
  async getUserPurchasesPage(userId: string, page = 1, pageSize = 5): Promise<PurchasePage> {
    const total = await this.purchaseRepo.countByUser(userId);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, Math.floor(page)), pages);
    const items = await this.purchaseRepo.findByUserPaged(
      userId,
      (current - 1) * pageSize,
      pageSize,
    );
    return { items, total, page: current, pages, pageSize };
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
