import { describe, it, expect } from "vitest";
import { decodeSession } from "./auth";

describe("auth.decodeSession", () => {
  it("decodifica o payload do JWT", () => {
    const payload = btoa(JSON.stringify({ sub: "user_1", email: "a@b.com", name: "Yves" }));
    expect(decodeSession(`h.${payload}.s`)).toEqual({
      sub: "user_1",
      email: "a@b.com",
      name: "Yves",
    });
  });

  it("retorna null para token inválido ou sem sub", () => {
    expect(decodeSession(null)).toBeNull();
    expect(decodeSession("garbage")).toBeNull();
    const noSub = btoa(JSON.stringify({ email: "a@b.com" }));
    expect(decodeSession(`h.${noSub}.s`)).toBeNull();
  });
});
