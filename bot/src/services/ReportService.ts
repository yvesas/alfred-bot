import { inject, injectable } from "inversify";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { PurchaseService, SpendingReport } from "./PurchaseService";

export interface MonthlyPoint {
  year: number;
  month: number; // 1-12
  total: number;
  count: number;
}

export interface DashboardReport {
  current: SpendingReport; // mês atual (total, count, por categoria/loja)
  last: SpendingReport; // mês passado (para comparativo)
  monthly: MonthlyPoint[]; // série dos últimos meses
}

// Agrega os dados do painel web (relatórios mais ricos).
@injectable()
export class ReportService {
  constructor(
    @inject(PurchaseRepository) private purchaseRepo: PurchaseRepository,
    @inject(PurchaseService) private purchaseService: PurchaseService,
  ) {}

  async dashboard(userId: string, months = 6): Promise<DashboardReport> {
    const [current, last, monthly] = await Promise.all([
      this.purchaseService.getSpendingReport(userId, "current_month"),
      this.purchaseService.getSpendingReport(userId, "last_month"),
      this.purchaseRepo.getMonthlyTotals(userId, months),
    ]);
    return { current, last, monthly };
  }
}
