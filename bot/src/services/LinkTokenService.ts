import { randomBytes } from "node:crypto";
import { inject, injectable } from "inversify";
import { ConversationStateStore } from "../core/ConversationStateStore";
import { config } from "../infra/config";

// Tokens curtos de vínculo (Fase 6). O web (logado) gera um token associado ao
// User._id canônico; o usuário o leva ao Telegram/WhatsApp (deep-link) e o bot o
// consome para fundir as contas. Curto de propósito: cabe no payload do
// `t.me?start=` (limite de 64 chars).
//
// Guardado no store compartilhado (C2): o token é emitido pelo AuthServer e consumido
// pelo adapter, que podem estar em réplicas diferentes.
@injectable()
export class LinkTokenService {
  constructor(@inject(ConversationStateStore) private store: ConversationStateStore) {}

  /** Emite um token para o usuário canônico. */
  async issue(userId: string): Promise<string> {
    const token = randomBytes(9).toString("base64url"); // 12 chars, [A-Za-z0-9_-]
    await this.store.put("link", token, userId, config.linkTokenTtlMs);
    return token;
  }

  /**
   * Consome o token (uso único). Retorna o userId canônico, ou null se inexistente
   * ou expirado. `take` lê e apaga numa operação só: duas réplicas consumindo o mesmo
   * token ao mesmo tempo, só uma recebe o valor.
   */
  async consume(token: string): Promise<string | null> {
    if (!token) return null;
    return this.store.take<string>("link", token);
  }
}
