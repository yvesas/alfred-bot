import "reflect-metadata";
import { injectable } from "inversify";
import { PurchaseModel, IPurchase, IPurchaseCreate } from "../models/Purchase";

export interface SpendingSummary {
  total: number;
  count: number;
  byCategory: Record<string, number>;
  byStore: Record<string, number>;
}

@injectable()
export class PurchaseRepository {
  async create(purchase: IPurchaseCreate): Promise<IPurchase> {
    return await PurchaseModel.create(purchase);
  }

  async findByUser(userId: string): Promise<IPurchase[]> {
    return await PurchaseModel.find({ userId }).sort({ date: -1 }).exec();
  }

  // Página de compras (mais recentes primeiro) para o histórico paginado.
  async findByUserPaged(userId: string, skip: number, limit: number): Promise<IPurchase[]> {
    return await PurchaseModel.find({ userId }).sort({ date: -1 }).skip(skip).limit(limit).exec();
  }

  async countByUser(userId: string): Promise<number> {
    return await PurchaseModel.countDocuments({ userId }).exec();
  }

  // Cupom já registrado por este usuário? (dedup por chave de acesso da NFC-e)
  async findByFiscalKey(userId: string, fiscalKey: string): Promise<IPurchase | null> {
    return await PurchaseModel.findOne({ userId, fiscalKey }).exec();
  }

  // Totais por mês (ano/mês) desde os últimos `months` meses — para o painel/relatórios.
  // B4: agrupa pela data de LANÇAMENTO (`createdAt`), não pela data do cupom.
  async getMonthlyTotals(
    userId: string,
    months: number,
    now: Date = new Date(),
  ): Promise<{ year: number; month: number; total: number; count: number }[]> {
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const rows = await PurchaseModel.aggregate<{
      _id: { y: number; m: number };
      total: number;
      count: number;
    }>([
      { $match: { userId, createdAt: { $gte: start } } },
      {
        $group: {
          _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
          total: { $sum: "$total" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]);
    return rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total, count: r.count }));
  }

  // Exclui todas as compras do usuário (exclusão de conta). Retorna o total removido.
  async deleteByUser(userId: string): Promise<number> {
    const result = await PurchaseModel.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }

  // Migra as compras de um userId para outro (merge de conta anônima → logada). Retorna o total.
  async reassignUser(oldUserId: string, newUserId: string): Promise<number> {
    const result = await PurchaseModel.updateMany(
      { userId: oldUserId },
      { $set: { userId: newUserId } },
    ).exec();
    return result.modifiedCount ?? 0;
  }

  // Escopados ao userId: o usuário só altera/exclui as próprias compras.
  async deleteById(userId: string, id: string): Promise<IPurchase | null> {
    return await PurchaseModel.findOneAndDelete({ _id: id, userId }).exec();
  }

  async updateById(
    userId: string,
    id: string,
    patch: Partial<IPurchaseCreate>,
  ): Promise<IPurchase | null> {
    return await PurchaseModel.findOneAndUpdate({ _id: id, userId }, patch, { new: true }).exec();
  }

  async getTotalSpent(userId: string, month: number, year: number): Promise<number> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // B4: filtra pela data de lançamento (createdAt), não pela data do cupom.
    const purchases = await PurchaseModel.find({ userId, createdAt: { $gte: start, $lt: end } });
    return purchases.reduce((total, p) => total + p.total, 0);
  }

  // Resumo de gastos no intervalo informado (via aggregation). Sem start/end = todo o histórico.
  // B4: o intervalo filtra a data de LANÇAMENTO (`createdAt`), não a data do cupom.
  async getSpendingSummary(userId: string, start?: Date, end?: Date): Promise<SpendingSummary> {
    const match: Record<string, unknown> = { userId };
    if (start || end) {
      match.createdAt = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lt: end } : {}),
      };
    }

    // Normaliza string vazia/nula para um rótulo default.
    const labelOrDefault = (field: string, fallback: string) => ({
      $let: {
        vars: { v: { $trim: { input: { $ifNull: [field, ""] } } } },
        in: { $cond: [{ $gt: [{ $strLenCP: "$$v" }, 0] }, "$$v", fallback] },
      },
    });

    const [result] = await PurchaseModel.aggregate<{
      totals: { total: number; count: number }[];
      byStore: { _id: string; amount: number }[];
      byCategory: { _id: string; amount: number }[];
    }>([
      { $match: match },
      {
        $facet: {
          totals: [{ $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } }],
          byStore: [
            {
              $group: {
                _id: labelOrDefault("$store.name", "Sem loja"),
                amount: { $sum: "$total" },
              },
            },
          ],
          byCategory: [
            {
              $project: {
                entries: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
                    "$items",
                    [{ category: "Outros", total: "$total" }],
                  ],
                },
              },
            },
            { $unwind: "$entries" },
            {
              $group: {
                _id: labelOrDefault("$entries.category", "Outros"),
                amount: { $sum: { $ifNull: ["$entries.total", 0] } },
              },
            },
          ],
        },
      },
    ]);

    const totals = result?.totals[0] ?? { total: 0, count: 0 };
    const toRecord = (arr: { _id: string; amount: number }[] = []) =>
      Object.fromEntries(arr.map((e) => [e._id, e.amount]));

    return {
      total: totals.total,
      count: totals.count,
      byStore: toRecord(result?.byStore),
      byCategory: toRecord(result?.byCategory),
    };
  }
}
