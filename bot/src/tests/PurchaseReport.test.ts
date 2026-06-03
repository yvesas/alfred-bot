import "reflect-metadata";
import { PurchaseService } from "../services/PurchaseService";
import { PurchaseRepository, SpendingSummary } from "../repositories/PurchaseRepository";
import sinon from "sinon";

describe("PurchaseService.getSpendingReport", () => {
  let purchaseRepoMock: sinon.SinonStubbedInstance<PurchaseRepository>;
  let purchaseService: PurchaseService;

  const summary: SpendingSummary = {
    total: 150,
    count: 2,
    byCategory: { Alimentação: 100, Outros: 50 },
    byStore: { "Mercado ABC": 150 },
  };

  beforeEach(() => {
    purchaseRepoMock = sinon.createStubInstance(PurchaseRepository);
    purchaseService = new PurchaseService(purchaseRepoMock);
    purchaseRepoMock.getSpendingSummary.resolves(summary);
  });

  it("queries the current month with a start and end window", async () => {
    const report = await purchaseService.getSpendingReport("123", "current_month");

    expect(report.period).toBe("current_month");
    expect(report.total).toBe(150);
    expect(report.byCategory.Alimentação).toBe(100);

    const [userId, start, end] = purchaseRepoMock.getSpendingSummary.firstCall.args;
    expect(userId).toBe("123");
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect((start as Date).getTime()).toBeLessThan((end as Date).getTime());
  });

  it("queries the whole history without a date window for 'all'", async () => {
    await purchaseService.getSpendingReport("123", "all");

    const [, start, end] = purchaseRepoMock.getSpendingSummary.firstCall.args;
    expect(start).toBeUndefined();
    expect(end).toBeUndefined();
  });

  it("defaults to the current month", async () => {
    const report = await purchaseService.getSpendingReport("123");
    expect(report.period).toBe("current_month");
  });
});
