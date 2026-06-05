/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { ReportService } from "../services/ReportService";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { PurchaseService } from "../services/PurchaseService";

function report(total: number, count: number) {
  return { period: "current_month" as const, total, count, byCategory: {}, byStore: {} };
}

describe("ReportService.dashboard", () => {
  let purchaseRepo: sinon.SinonStubbedInstance<PurchaseRepository>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;
  let service: ReportService;

  beforeEach(() => {
    purchaseRepo = sinon.createStubInstance(PurchaseRepository);
    purchaseService = sinon.createStubInstance(PurchaseService);
    service = new ReportService(purchaseRepo, purchaseService);
  });

  it("reúne mês atual, mês passado e série mensal", async () => {
    purchaseService.getSpendingReport
      .withArgs("u1", "current_month")
      .resolves(report(150, 3) as any);
    purchaseService.getSpendingReport.withArgs("u1", "last_month").resolves(report(90, 2) as any);
    purchaseRepo.getMonthlyTotals.resolves([{ year: 2026, month: 6, total: 150, count: 3 }]);

    const dash = await service.dashboard("u1");

    expect(dash.current.total).toBe(150);
    expect(dash.last.total).toBe(90);
    expect(dash.monthly).toHaveLength(1);
    expect(purchaseRepo.getMonthlyTotals.calledWith("u1", 6)).toBe(true);
  });
});
