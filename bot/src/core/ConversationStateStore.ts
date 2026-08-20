import { injectable } from "inversify";
import { ConversationStateModel, ConversationStateKind } from "../models/ConversationState";

// Guarda o estado que atravessa duas mensagens, fora da memória do processo (C2).
//
// A interface é a de um Map com validade — `put`, `get`, `take`, `remove` — porque era
// literalmente um Map antes. Quem usa não sabe que virou banco.
@injectable()
export class ConversationStateStore {
  // O índice único em (kind, key) é o que faz `put` sobrescrever em vez de duplicar,
  // e o índice de TTL é o que impede a coleção de crescer para sempre. O Mongoose os
  // constrói de forma assíncrona, então esperamos uma vez antes da primeira escrita.
  private indexesReady?: Promise<unknown>;

  private ensureIndexes(): Promise<unknown> {
    this.indexesReady ??= ConversationStateModel.init();
    return this.indexesReady;
  }

  async put<T>(kind: ConversationStateKind, key: string, value: T, ttlMs: number): Promise<void> {
    await this.ensureIndexes();
    await ConversationStateModel.findOneAndUpdate(
      { kind, key },
      { $set: { value, expiresAt: new Date(Date.now() + ttlMs) } },
      { upsert: true },
    ).exec();
  }

  /**
   * Lê sem consumir. Filtra por `expiresAt` porque o varredor de TTL do Mongo roda a
   * cada ~60 s — sem o filtro, um estado vencido responderia por até um minuto.
   */
  async get<T>(kind: ConversationStateKind, key: string): Promise<T | null> {
    const row = await ConversationStateModel.findOne({
      kind,
      key,
      expiresAt: { $gt: new Date() },
    }).exec();
    return row ? (row.value as T) : null;
  }

  /**
   * Lê e apaga numa operação só. É o que um token de uso único precisa: duas
   * instâncias consumindo o mesmo token ao mesmo tempo, só uma recebe o valor.
   */
  async take<T>(kind: ConversationStateKind, key: string): Promise<T | null> {
    const row = await ConversationStateModel.findOneAndDelete({
      kind,
      key,
      expiresAt: { $gt: new Date() },
    }).exec();
    return row ? (row.value as T) : null;
  }

  async remove(kind: ConversationStateKind, key: string): Promise<void> {
    await ConversationStateModel.deleteOne({ kind, key }).exec();
  }
}
