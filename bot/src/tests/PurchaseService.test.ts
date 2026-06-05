import "reflect-metadata";
import { PurchaseService } from "../services/PurchaseService";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { IPurchase, IPurchaseCreate, PurchaseModel } from "../models/Purchase";
import sinon from "sinon";

describe("PurchaseService", () => {
  let purchaseRepoMock: sinon.SinonStubbedInstance<PurchaseRepository>;
  let purchaseService: PurchaseService;

  beforeEach(() => {
    purchaseRepoMock = sinon.createStubInstance(PurchaseRepository);
    purchaseService = new PurchaseService(purchaseRepoMock);
  });

  it("should add a valid purchase", async () => {
    const purchase: IPurchaseCreate = {
      userId: "123",
      description: "Coffee",
      total: 10,
      date: new Date(),
      items: [],
    };
    const purchaseMock = new PurchaseModel({
      ...purchase,
      _id: "mocked_id",
    }) as IPurchase;

    purchaseRepoMock.create.resolves(purchaseMock);

    const result = await purchaseService.addPurchase(purchase);
    expect(result).toEqual(purchaseMock);
    expect(purchaseRepoMock.create.calledOnce).toBeTruthy();
  });

  it("should throw an error when purchase data is invalid", async () => {
    const purchase: Partial<IPurchase> = {
      userId: "123",
      description: "",
      total: -10,
      items: [],
    };

    await expect(purchaseService.addPurchase(purchase as IPurchase)).rejects.toThrow(
      "Invalid purchase data",
    );
  });

  it("paginates the history (clamps page, computes total pages)", async () => {
    purchaseRepoMock.countByUser.resolves(12);
    purchaseRepoMock.findByUserPaged.resolves([{ description: "x" } as IPurchase]);

    const page = await purchaseService.getUserPurchasesPage("123", 99, 5);

    // 12 itens / 5 por página = 3 páginas; pedimos 99 → clampa para 3.
    expect(page.pages).toBe(3);
    expect(page.page).toBe(3);
    expect(page.total).toBe(12);
    // offset da página 3 = (3-1)*5 = 10.
    expect(purchaseRepoMock.findByUserPaged.calledWith("123", 10, 5)).toBe(true);
  });
});
