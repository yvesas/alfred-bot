import "reflect-metadata";
import { RateLimiter } from "../services/RateLimiter";

// Antes estes testes escreviam no campo privado `max` para ajustar o limite. Com o
// limite no contrato público (`allow(key, limit)`), dá para exercitar o comportamento
// em vez da implementação — e o mesmo caminho é o que o AuthServer usa.
describe("RateLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = new RateLimiter();
    const limit = { max: 3, windowMs: 60_000 };

    expect(limiter.allow("u1", limit)).toBe(true);
    expect(limiter.allow("u1", limit)).toBe(true);
    expect(limiter.allow("u1", limit)).toBe(true);
    expect(limiter.allow("u1", limit)).toBe(false);
  });

  it("tracks users independently", () => {
    const limiter = new RateLimiter();
    const limit = { max: 1, windowMs: 60_000 };

    expect(limiter.allow("a", limit)).toBe(true);
    expect(limiter.allow("a", limit)).toBe(false);
    expect(limiter.allow("b", limit)).toBe(true);
  });

  it("uses the configured default when no limit is given", () => {
    const limiter = new RateLimiter();

    // O default vem de RATE_LIMIT_MAX (20). O caminho do chat não passa limite.
    expect(limiter.allow("chat-user")).toBe(true);
  });

  it("frees the key once the window has slid past", () => {
    const limiter = new RateLimiter();
    const oneMs = { max: 1, windowMs: 1 };

    expect(limiter.allow("u", oneMs)).toBe(true);
    // Janela de 1 ms: o próximo tick já não vê o acesso anterior.
    return new Promise((resolve) =>
      setTimeout(() => {
        expect(limiter.allow("u", oneMs)).toBe(true);
        resolve(undefined);
      }, 5),
    );
  });
});
