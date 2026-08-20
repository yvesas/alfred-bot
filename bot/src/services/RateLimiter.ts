import "reflect-metadata";
import { injectable } from "inversify";
import { config } from "../infra/config";

export interface RateLimit {
  max: number;
  windowMs: number;
}

// Rate limiter de janela deslizante, em memória.
//
// É o ÚNICO estado que continuou em memória depois do C2, e por escolha: dispara em
// toda mensagem e toda requisição, e ida ao banco a cada uma custaria mais do que o
// problema vale. O preço é que cada réplica tem a própria janela — então o teto é
// dividido por `REPLICAS`, para N instâncias somarem o limite configurado.
//
// A aproximação é real e vale dizer: só é exata se o balanceador distribuir de forma
// uniforme. Preferimos barrar cedo a deixar passar N vezes.
@injectable()
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly defaults: RateLimit = {
    max: config.rateLimit.max,
    windowMs: config.rateLimit.windowMs,
  };

  // Registra um acesso. Retorna true se permitido, false se o limite foi excedido.
  // `limit` sobrescreve o default — o HTTP usa janela mais apertada que o chat.
  allow(key: string, limit: RateLimit = this.defaults): boolean {
    const now = Date.now();
    const windowStart = now - limit.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= perReplica(limit.max)) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  // Segundos até a chave voltar a ser aceita. Vira o header Retry-After.
  retryAfterSeconds(key: string, limit: RateLimit = this.defaults): number {
    const oldest = (this.hits.get(key) ?? [])[0];
    if (oldest === undefined) return 0;
    return Math.max(1, Math.ceil((oldest + limit.windowMs - Date.now()) / 1000));
  }

  // Descarta chaves cuja janela já venceu. Com chave de usuário o mapa é limitado;
  // com chave de IP não é — sem isto, um scan de rede faz o processo crescer sem teto.
  prune(now: number = Date.now()): void {
    const longest = Math.max(this.defaults.windowMs, config.httpRateLimit.windowMs);
    for (const [key, times] of this.hits) {
      if (times.length === 0 || times[times.length - 1] <= now - longest) {
        this.hits.delete(key);
      }
    }
  }
}

// Teto desta instância. Com uma réplica é o próprio limite; com N, a fração — nunca
// menos de 1, senão o limitador barraria tudo.
function perReplica(max: number): number {
  return Math.max(1, Math.floor(max / config.replicas));
}
