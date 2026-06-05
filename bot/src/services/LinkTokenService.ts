import { randomBytes } from "node:crypto";
import { injectable } from "inversify";

// Tokens curtos de vínculo (Fase 6). O web (logado) gera um token associado ao User._id
// canônico; o usuário o leva ao Telegram/WhatsApp (deep-link) e o bot o consome para fundir
// as contas. Curto de propósito: cabe no payload do `t.me?start=` (limite de 64 chars).
//
// Armazenamento em memória (TTL ~10 min): suficiente para uma instância. Em multi-instância,
// trocar por Redis/coleção compartilhada.
const TTL_MS = 10 * 60 * 1000;

interface Entry {
  userId: string;
  expiresAt: number;
}

@injectable()
export class LinkTokenService {
  private readonly tokens = new Map<string, Entry>();

  // Emite um token para o usuário canônico. `now` é injetável para testes.
  issue(userId: string, now: number = Date.now()): string {
    const token = randomBytes(9).toString("base64url"); // 12 chars, [A-Za-z0-9_-]
    this.tokens.set(token, { userId, expiresAt: now + TTL_MS });
    return token;
  }

  // Consome o token (uso único). Retorna o userId canônico, ou null se inexistente/expirado.
  consume(token: string, now: number = Date.now()): string | null {
    const entry = this.tokens.get(token);
    if (!entry) return null;
    this.tokens.delete(token);
    if (entry.expiresAt < now) return null;
    return entry.userId;
  }
}
