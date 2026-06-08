import { describe, it, expect, vi, afterEach } from "vitest";
import { decodeSession, startEmailLogin, verifyEmailLogin } from "./auth";

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

describe("auth email login (Magic Auth)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("startEmailLogin retorna true quando o backend responde ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    expect(await startEmailLogin("a@b.com")).toBe(true);
  });

  it("verifyEmailLogin guarda o token em caso de sucesso", async () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt123" }) }),
    );

    expect(await verifyEmailLogin("a@b.com", "123456", "cid")).toBe(true);
    expect(store["alfred:jwt"]).toBe("jwt123");
  });

  it("verifyEmailLogin retorna false em código inválido", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await verifyEmailLogin("a@b.com", "000", "cid")).toBe(false);
  });
});
