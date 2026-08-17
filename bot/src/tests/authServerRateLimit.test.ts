import "reflect-metadata";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sinon from "sinon";
import { AuthServer } from "../infra/authServer";
import { AuthService } from "../services/AuthService";
import { AccountService } from "../services/AccountService";
import { LinkTokenService } from "../services/LinkTokenService";
import { ReportService } from "../services/ReportService";
import { PlanService } from "../services/PlanService";
import { ExportService } from "../services/ExportService";
import { UserService } from "../services/UserService";
import { RateLimiter } from "../services/RateLimiter";
import { config } from "../infra/config";

// C6 — o AuthServer estava aberto. `POST /auth/email/start` dispara e-mail real pelo
// WorkOS: sem teto dá para queimar a cota, spammar terceiros e enumerar contas.
describe("AuthServer — rate limit (C6)", () => {
  let auth: sinon.SinonStubbedInstance<AuthService>;
  let server: http.Server;
  let base: string;
  let authServer: AuthServer;

  // Limites originais, restaurados no fim: config é objeto compartilhado.
  const originalHttp = { ...config.httpRateLimit };
  const originalEmail = { ...config.authEmailRateLimit };

  beforeEach(async () => {
    auth = sinon.createStubInstance(AuthService);
    auth.sendEmailCode.resolves();

    authServer = new AuthServer(
      auth,
      sinon.createStubInstance(AccountService),
      sinon.createStubInstance(LinkTokenService),
      sinon.createStubInstance(ReportService),
      sinon.createStubInstance(PlanService),
      sinon.createStubInstance(ExportService),
      sinon.createStubInstance(UserService),
      new RateLimiter(),
    );

    server = authServer.start(0);
    if (!server.listening) await new Promise((res) => server.once("listening", res));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    authServer.stop();
    Object.assign(config.httpRateLimit, originalHttp);
    Object.assign(config.authEmailRateLimit, originalEmail);
  });

  const postEmail = (email = "alguem@exemplo.com") =>
    fetch(`${base}/auth/email/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

  it("responde 429 depois de estourar o limite de /auth/email/*", async () => {
    config.authEmailRateLimit.max = 2;

    expect((await postEmail()).status).toBe(200);
    expect((await postEmail()).status).toBe(200);

    const blocked = await postEmail();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  // O ponto do C6: cada chamada custa um e-mail de verdade. Bloqueado significa
  // que o provedor NÃO foi chamado, não apenas que a resposta mudou.
  it("não chama o WorkOS quando bloqueia", async () => {
    config.authEmailRateLimit.max = 1;

    await postEmail();
    await postEmail();

    expect(auth.sendEmailCode.callCount).toBe(1);
  });

  it("não revela qual limite foi atingido nem se o e-mail existe", async () => {
    config.authEmailRateLimit.max = 1;
    await postEmail();

    const blocked = await postEmail();
    const body = await blocked.json();

    expect(body).toEqual({ error: "too many requests" });
  });

  it("aplica limite mais apertado no e-mail do que no resto da API", async () => {
    config.authEmailRateLimit.max = 1;
    config.httpRateLimit.max = 50;

    await postEmail();
    expect((await postEmail()).status).toBe(429);

    // O balde do /api/* é outro — não foi consumido pelas chamadas de e-mail.
    const api = await fetch(`${base}/api/me`);
    expect(api.status).toBe(401); // sem token, mas passou do rate limit
  });

  it("limita rota inexistente — é o que uma varredura usa", async () => {
    config.httpRateLimit.max = 2;

    expect((await fetch(`${base}/nao-existe`)).status).toBe(404);
    expect((await fetch(`${base}/tambem-nao`)).status).toBe(404);
    expect((await fetch(`${base}/nem-esta`)).status).toBe(429);
  });

  it("não gasta cota no preflight de CORS", async () => {
    config.httpRateLimit.max = 1;

    expect((await fetch(`${base}/api/me`, { method: "OPTIONS" })).status).toBe(204);
    expect((await fetch(`${base}/api/me`, { method: "OPTIONS" })).status).toBe(204);
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
  });
});

describe("RateLimiter — chave, janela e limpeza", () => {
  it("aceita limite por chamada, sem tocar no default", () => {
    const limiter = new RateLimiter();
    const tight = { max: 1, windowMs: 60_000 };

    expect(limiter.allow("ip-a", tight)).toBe(true);
    expect(limiter.allow("ip-a", tight)).toBe(false);
    // Chave diferente, balde diferente.
    expect(limiter.allow("ip-b", tight)).toBe(true);
  });

  it("informa quantos segundos faltam para liberar", () => {
    const limiter = new RateLimiter();
    const tight = { max: 1, windowMs: 60_000 };

    limiter.allow("ip", tight);
    limiter.allow("ip", tight);

    const wait = limiter.retryAfterSeconds("ip", tight);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
  });

  // Chave de IP tem cardinalidade ilimitada — sem poda, uma varredura de rede faz o
  // processo crescer sem teto.
  it("descarta chaves cuja janela já venceu", () => {
    const limiter = new RateLimiter();
    limiter.allow("ip-antigo", { max: 5, windowMs: 1 });

    limiter.prune(Date.now() + 24 * 60 * 60 * 1000);

    // Depois da poda, o balde recomeça do zero.
    expect(limiter.allow("ip-antigo", { max: 1, windowMs: 60_000 })).toBe(true);
  });
});
