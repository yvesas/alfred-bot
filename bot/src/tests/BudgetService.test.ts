/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { BudgetService } from "../services/BudgetService";
import { UserService } from "../services/UserService";
import { PurchaseService } from "../services/PurchaseService";

const TG = "telegram" as const;

function report(byCategory: Record<string, number>) {
  return {
    period: "current_month" as const,
    total: 0,
    count: 0,
    byCategory,
    byStore: {},
  };
}

describe("BudgetService", () => {
  let userService: sinon.SinonStubbedInstance<UserService>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let service: BudgetService;

  beforeEach(() => {
    userService = sinon.createStubInstance(UserService);
    purchaseService = sinon.createStubInstance(PurchaseService);
    service = new BudgetService(userService, purchaseService);
  });

  it("não alerta quando não há orçamentos", async () => {
    userService.getBudgets.resolves([]);
    const alerts = await service.alertsForPurchase(TG, "1", { items: [] } as any);
    expect(alerts).toEqual([]);
    expect(purchaseService.getSpendingReport.called).toBe(false);
  });

  it("alerta de estouro (>= 100%) na categoria da compra", async () => {
    userService.getBudgets.resolves([{ category: "Alimentação", limit: 80 }]);
    purchaseService.getSpendingReport.resolves(report({ Alimentação: 90 }));

    const alerts = await service.alertsForPurchase(TG, "1", {
      items: [{ category: "Alimentação", total: 90 }],
    } as any);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("estourado");
  });

  it("alerta ao chegar em 80% do orçamento", async () => {
    userService.getBudgets.resolves([{ category: "Alimentação", limit: 100 }]);
    purchaseService.getSpendingReport.resolves(report({ Alimentação: 85 }));

    const alerts = await service.alertsForPurchase(TG, "1", {
      items: [{ category: "Alimentação", total: 5 }],
    } as any);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("85%");
  });

  it("ignora orçamentos de categorias não tocadas pela compra", async () => {
    userService.getBudgets.resolves([{ category: "Transporte", limit: 50 }]);

    const alerts = await service.alertsForPurchase(TG, "1", {
      items: [{ category: "Alimentação", total: 90 }],
    } as any);

    expect(alerts).toEqual([]);
    expect(purchaseService.getSpendingReport.called).toBe(false);
  });
});
