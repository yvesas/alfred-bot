import { inject, injectable } from "inversify";
import { PurchaseService } from "./PurchaseService";
import { Plan } from "../models/User";
import { config } from "../infra/config";

export interface PlanUsage {
  plan: Plan;
  monthCount: number; // compras registradas no mês atual
  limit: number; // limite mensal do plano free
}

// Planos de uso (free/pro). Enforcement leve: o free limita compras/mês; o pro é ilimitado.
@injectable()
export class PlanService {
  constructor(@inject(PurchaseService) private purchaseService: PurchaseService) {}

  get freeLimit(): number {
    return config.freeMonthlyPurchaseLimit;
  }

  // Pode registrar mais uma compra neste mês? Pro sempre pode; free até o limite.
  async canRegister(userId: string, plan: Plan = "free"): Promise<boolean> {
    if (plan === "pro") return true;
    const report = await this.purchaseService.getSpendingReport(userId, "current_month");
    return report.count < this.freeLimit;
  }

  async usage(userId: string, plan: Plan = "free"): Promise<PlanUsage> {
    const report = await this.purchaseService.getSpendingReport(userId, "current_month");
    return { plan, monthCount: report.count, limit: this.freeLimit };
  }
}
