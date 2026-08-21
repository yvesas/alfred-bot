import "reflect-metadata";
import { injectable } from "inversify";
import { ProactiveLogModel } from "../models/ProactiveLog";

@injectable()
export class ProactiveLogRepository {
  /**
   * Registra o aviso. Devolve `false` se já existia — quer dizer que outra réplica
   * ganhou a corrida, ou que já falamos disto antes.
   *
   * A garantia é o índice único em `(userId, key)`, não uma leitura anterior: entre
   * ler e escrever cabe outro ciclo. Mesma lição do `JobLockService`.
   */
  async claim(userId: string, key: string, ruleId: string, now: Date): Promise<boolean> {
    try {
      await ProactiveLogModel.create({ userId, key, ruleId, sentAt: now, delivered: false });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  async markDelivered(userId: string, key: string, delivered: boolean): Promise<void> {
    await ProactiveLogModel.updateOne({ userId, key }, { $set: { delivered } }).exec();
  }

  /** Quantos avisos saíram desde `since`. É o teto diário. */
  async countSince(userId: string, since: Date): Promise<number> {
    return await ProactiveLogModel.countDocuments({
      userId,
      sentAt: { $gte: since },
      delivered: true,
    }).exec();
  }

  /**
   * Marca que a pessoa respondeu ao aviso mais recente, se ele for recente o
   * bastante. É o sinal de que o aviso serviu.
   */
  async markResponded(userId: string, since: Date, now: Date): Promise<boolean> {
    const result = await ProactiveLogModel.findOneAndUpdate(
      { userId, delivered: true, respondedAt: null, sentAt: { $gte: since } },
      { $set: { respondedAt: now } },
      { sort: { sentAt: -1 } },
    ).exec();
    return result !== null;
  }

  /** Exclusão de conta (LGPD). */
  async deleteByUser(userId: string): Promise<number> {
    const result = await ProactiveLogModel.deleteMany({ userId }).exec();
    return result.deletedCount ?? 0;
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
