import { inject, injectable } from "inversify";
import { Platform } from "./IncomingMessage";
import { conversationKey } from "./conversationKey";
import { ConversationStateStore } from "./ConversationStateStore";
import { config } from "../infra/config";

// E-mails aguardando o código de verificação (Magic Auth), por conversa.
//
// Vivia num Map do processo; agora vai para o store compartilhado (C2), então a
// pessoa pode pedir o código numa réplica e mandar o código para outra. A validade
// acompanha a do código do WorkOS — guardar mais tempo que ele vale seria mentira.
@injectable()
export class PendingEmailStore {
  constructor(@inject(ConversationStateStore) private store: ConversationStateStore) {}

  async set(platform: Platform, externalId: string, email: string): Promise<void> {
    await this.store.put(
      "email",
      conversationKey(platform, externalId),
      email,
      config.pendingEmailTtlMs,
    );
  }

  async get(platform: Platform, externalId: string): Promise<string | undefined> {
    const email = await this.store.get<string>("email", conversationKey(platform, externalId));
    return email ?? undefined;
  }

  async clear(platform: Platform, externalId: string): Promise<void> {
    await this.store.remove("email", conversationKey(platform, externalId));
  }
}
