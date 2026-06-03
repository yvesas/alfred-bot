import "reflect-metadata";
import { injectable } from "inversify";
import { config } from "../infra/config";

// Rate limiter por usuário (janela deslizante, em memória).
// Nota: o estado é por instância — para escalar horizontalmente, migrar para Redis.
@injectable()
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private max = config.rateLimit.max;
  private windowMs = config.rateLimit.windowMs;

  // Registra um acesso. Retorna true se permitido, false se o limite foi excedido.
  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}
