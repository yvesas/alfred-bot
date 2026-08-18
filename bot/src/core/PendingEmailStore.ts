import { injectable } from "inversify";
import { Platform } from "./IncomingMessage";
import { conversationKey } from "./conversationKey";

// E-mails aguardando o código de verificação (Magic Auth), por conversa.
//
// Vive numa classe própria pelo mesmo motivo que as compras pendentes vivem no
// `PurchaseFlow`: é estado que atravessa duas mensagens, e hoje só existe na memória
// do processo. Reiniciar perde, e uma segunda réplica não enxerga (C2). Quando isso
// for para Redis, é esta classe que muda — e mais nada.
@injectable()
export class PendingEmailStore {
  private readonly pending = new Map<string, string>();

  set(platform: Platform, externalId: string, email: string): void {
    this.pending.set(conversationKey(platform, externalId), email);
  }

  get(platform: Platform, externalId: string): string | undefined {
    return this.pending.get(conversationKey(platform, externalId));
  }

  clear(platform: Platform, externalId: string): void {
    this.pending.delete(conversationKey(platform, externalId));
  }
}
