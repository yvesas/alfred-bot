/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { ExportService } from "../services/ExportService";
import { PurchaseService } from "../services/PurchaseService";

describe("ExportService", () => {
  it("gera CSV com cabeçalho e uma linha por compra (com escaping)", async () => {
    const purchaseService = sinon.createStubInstance(PurchaseService);
    purchaseService.getUserPurchases.resolves([
      {
        date: new Date("2026-06-01T00:00:00.000Z"),
        description: "Café, premium", // tem vírgula → deve ser aspeado
        total: 12.5,
        store: { name: "Bar X" },
        items: [{ category: "Alimentação" }],
        fiscalKey: "K1",
      } as any,
    ]);

    const csv = await new ExportService(purchaseService).purchasesCsv("u1");
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Data,Descrição,Total,Loja,Categorias,Chave");
    expect(lines[1]).toBe('2026-06-01,"Café, premium",12.50,Bar X,Alimentação,K1');
  });

  it("retorna só o cabeçalho quando não há compras", async () => {
    const purchaseService = sinon.createStubInstance(PurchaseService);
    purchaseService.getUserPurchases.resolves([]);
    const csv = await new ExportService(purchaseService).purchasesCsv("u1");
    expect(csv.split("\n")).toHaveLength(1);
  });
});
