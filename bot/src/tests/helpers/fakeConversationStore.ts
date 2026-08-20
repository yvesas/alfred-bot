import { ConversationStateStore } from "../../core/ConversationStateStore";
import { ConversationStateKind } from "../../models/ConversationState";

// Duplo em memória do ConversationStateStore, para os testes unitários que não querem
// banco. Respeita o contrato que importa — incluindo a validade, porque um estado
// vencido tem que sumir aqui como some lá.
//
// O comportamento real contra o Mongo (índice de TTL, `take` atômico) é provado em
// `ConversationStateStore.test.ts`, com banco de verdade.
export class FakeConversationStore extends ConversationStateStore {
  private readonly rows = new Map<string, { value: unknown; expiresAt: number }>();

  private id(kind: ConversationStateKind, key: string): string {
    return `${kind}:${key}`;
  }

  override async put<T>(
    kind: ConversationStateKind,
    key: string,
    value: T,
    ttlMs: number,
  ): Promise<void> {
    this.rows.set(this.id(kind, key), { value, expiresAt: Date.now() + ttlMs });
  }

  override async get<T>(kind: ConversationStateKind, key: string): Promise<T | null> {
    const row = this.rows.get(this.id(kind, key));
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.rows.delete(this.id(kind, key));
      return null;
    }
    return row.value as T;
  }

  override async take<T>(kind: ConversationStateKind, key: string): Promise<T | null> {
    const value = await this.get<T>(kind, key);
    if (value !== null) this.rows.delete(this.id(kind, key));
    return value;
  }

  override async remove(kind: ConversationStateKind, key: string): Promise<void> {
    this.rows.delete(this.id(kind, key));
  }
}
