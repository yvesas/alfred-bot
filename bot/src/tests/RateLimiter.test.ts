/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { RateLimiter } from "../services/RateLimiter";

describe("RateLimiter", () => {
  it("allows up to the limit then blocks", () => {
    const limiter = new RateLimiter();
    (limiter as any).max = 3;

    expect(limiter.allow("u1")).toBe(true);
    expect(limiter.allow("u1")).toBe(true);
    expect(limiter.allow("u1")).toBe(true);
    expect(limiter.allow("u1")).toBe(false);
  });

  it("tracks users independently", () => {
    const limiter = new RateLimiter();
    (limiter as any).max = 1;

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });
});
