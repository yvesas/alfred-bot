/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { PurchaseModel, IPurchaseCreate } from "../models/Purchase";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

function purchase(over: Partial<IPurchaseCreate>): IPurchaseCreate {
  return {
    userId: "u1",
    description: "compra",
    total: 10,
    date: new Date(2026, 5, 15),
    items: [],
    ...over,
  } as IPurchaseCreate;
}

describe("PurchaseRepository (mongo em memória)", () => {
  const repo = new PurchaseRepository();

  // Cria uma compra e fixa o createdAt (B4: relatórios agregam pela data de lançamento).
  // Usa o driver nativo porque o Mongoose marca createdAt como imutável (timestamps).
  async function createAt(over: Partial<IPurchaseCreate>, createdAt: Date) {
    const p = await repo.create(purchase(over));
    await PurchaseModel.collection.updateOne({ _id: p._id }, { $set: { createdAt } });
    return p;
  }

  beforeAll(async () => {
    await connectMemoryMongo();
  }, 120000);
  afterAll(async () => {
    await disconnectMemoryMongo();
  });
  beforeEach(async () => {
    await clearCollections();
  });

  it("cria e lista por usuário (mais recentes primeiro)", async () => {
    await repo.create(purchase({ description: "a", date: new Date(2026, 5, 1) }));
    await repo.create(purchase({ description: "b", date: new Date(2026, 5, 20) }));

    const list = await repo.findByUser("u1");
    expect(list.map((p) => p.description)).toEqual(["b", "a"]);
  });

  it("pagina (skip/limit) e conta", async () => {
    for (let i = 0; i < 7; i++) {
      await repo.create(purchase({ description: `p${i}`, date: new Date(2026, 5, i + 1) }));
    }
    expect(await repo.countByUser("u1")).toBe(7);
    const page2 = await repo.findByUserPaged("u1", 5, 5);
    expect(page2).toHaveLength(2);
  });

  it("agrega gastos por categoria e loja no período", async () => {
    const item = (category: string, total: number) =>
      ({ description: category, quantity: 1, unitPrice: total, total, category }) as any;
    const when = new Date(2026, 5, 15); // lançado em junho/2026
    await createAt(
      { total: 30, store: { name: "Mercado X" } as any, items: [item("Alimentação", 30)] },
      when,
    );
    await createAt(
      { total: 20, store: { name: "Mercado X" } as any, items: [item("Limpeza", 20)] },
      when,
    );

    const start = new Date(2026, 5, 1);
    const end = new Date(2026, 6, 1);
    const summary = await repo.getSpendingSummary("u1", start, end);

    expect(summary.total).toBe(50);
    expect(summary.count).toBe(2);
    expect(summary.byCategory["Alimentação"]).toBe(30);
    expect(summary.byStore["Mercado X"]).toBe(50);
  });

  it("totais por mês pela data de lançamento (B4)", async () => {
    await createAt({ total: 10 }, new Date(2026, 4, 10)); // lançado em maio
    await createAt({ total: 40 }, new Date(2026, 5, 10)); // lançado em junho
    await createAt({ total: 2 }, new Date(2026, 5, 12)); // lançado em junho

    const series = await repo.getMonthlyTotals("u1", 6, new Date(2026, 5, 30));
    const june = series.find((s) => s.month === 6);
    expect(june?.total).toBe(42);
    expect(june?.count).toBe(2);
  });

  it("update/delete escopados ao usuário", async () => {
    const p = await repo.create(purchase({ userId: "owner" }));
    const id = String(p._id);

    // outro usuário não altera nem exclui
    expect(await repo.updateById("intruso", id, { total: 99 })).toBeNull();
    expect(await repo.deleteById("intruso", id)).toBeNull();

    const updated = await repo.updateById("owner", id, { total: 77 });
    expect(updated?.total).toBe(77);
    expect(await repo.deleteById("owner", id)).not.toBeNull();
  });

  it("findByFiscalKey acha o cupom do usuário (dedup)", async () => {
    await repo.create(purchase({ userId: "u1", fiscalKey: "CHAVE-1" }));
    expect(await repo.findByFiscalKey("u1", "CHAVE-1")).not.toBeNull();
    expect(await repo.findByFiscalKey("u1", "OUTRA")).toBeNull();
    expect(await repo.findByFiscalKey("outro", "CHAVE-1")).toBeNull();
  });

  it("reassign e delete por usuário", async () => {
    await repo.create(purchase({ userId: "anon" }));
    await repo.create(purchase({ userId: "anon" }));

    expect(await repo.reassignUser("anon", "canon")).toBe(2);
    expect(await repo.countByUser("canon")).toBe(2);
    expect(await repo.deleteByUser("canon")).toBe(2);
    expect(await PurchaseModel.countDocuments()).toBe(0);
  });
});
