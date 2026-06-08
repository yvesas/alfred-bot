/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { PlanService } from "../services/PlanService";
import { PurchaseService } from "../services/PurchaseService";
import { config } from "../infra/config";

function report(count: number) {
  return { period: "current_month" as const, total: 0, count, byCategory: {}, byStore: {} };
}

describe("PlanService", () => {
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let service: PlanService;

  beforeEach(() => {
    purchaseService = sinon.createStubInstance(PurchaseService);
    service = new PlanService(purchaseService);
  });

  it("pro sempre pode registrar (sem consultar gastos)", async () => {
    expect(await service.canRegister("u1", "pro")).toBe(true);
    expect(purchaseService.getSpendingReport.called).toBe(false);
  });

  it("free pode registrar abaixo do limite", async () => {
    purchaseService.getSpendingReport.resolves(report(config.freeMonthlyPurchaseLimit - 1) as any);
    expect(await service.canRegister("u1", "free")).toBe(true);
  });

  it("free é bloqueado ao atingir o limite", async () => {
    purchaseService.getSpendingReport.resolves(report(config.freeMonthlyPurchaseLimit) as any);
    expect(await service.canRegister("u1", "free")).toBe(false);
  });

  it("usage retorna plano, contagem do mês e limite", async () => {
    purchaseService.getSpendingReport.resolves(report(7) as any);
    const u = await service.usage("u1", "free");
    expect(u).toEqual({ plan: "free", monthCount: 7, limit: config.freeMonthlyPurchaseLimit });
  });
});
