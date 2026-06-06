/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { config } from "../infra/config";

describe("AuthServer (integração HTTP)", () => {
  let auth: sinon.SinonStubbedInstance<AuthService>;
  let accounts: sinon.SinonStubbedInstance<AccountService>;
  let linkTokens: sinon.SinonStubbedInstance<LinkTokenService>;
  let reports: sinon.SinonStubbedInstance<ReportService>;
  let plans: sinon.SinonStubbedInstance<PlanService>;
  let exports: sinon.SinonStubbedInstance<ExportService>;
  let users: sinon.SinonStubbedInstance<UserService>;
  let server: http.Server;
  let base: string;
  let authServer: AuthServer;

  beforeEach(async () => {
    auth = sinon.createStubInstance(AuthService);
    accounts = sinon.createStubInstance(AccountService);
    linkTokens = sinon.createStubInstance(LinkTokenService);
    reports = sinon.createStubInstance(ReportService);
    plans = sinon.createStubInstance(PlanService);
    exports = sinon.createStubInstance(ExportService);
    users = sinon.createStubInstance(UserService);
    authServer = new AuthServer(auth, accounts, linkTokens, reports, plans, exports, users);

    server = authServer.start(0);
    if (!server.listening) await new Promise((res) => server.once("listening", res));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => authServer.stop());

  const authedUser = () =>
    ({
      _id: "u1",
      identities: [{ platform: "web", externalId: "wos1" }],
      plan: "free",
      name: "Yves",
      email: "a@b.com",
    }) as any;

  it("POST /auth/email/start envia o código", async () => {
    auth.sendEmailCode.resolves();
    const res = await fetch(`${base}/auth/email/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com" }),
    });
    expect(res.status).toBe(200);
    expect(auth.sendEmailCode.calledWith("a@b.com")).toBe(true);
  });

  it("POST /auth/email/verify devolve o token e absorve o anônimo", async () => {
    auth.authenticateEmail.resolves({ id: "wos1", email: "a@b.com", name: "Yves" });
    accounts.ensureWorkosUser.resolves({} as any);
    accounts.absorbAnonymous.resolves();
    auth.issueJwt.returns("jwt123");

    const res = await fetch(`${base}/auth/email/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", code: "123456", clientId: "anon" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("jwt123");
    expect(accounts.absorbAnonymous.calledWith("wos1", "anon")).toBe(true);
  });

  it("POST /auth/email/verify com código inválido → 401", async () => {
    auth.authenticateEmail.resolves(null);
    const res = await fetch(`${base}/auth/email/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", code: "000" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/me sem token → 401", async () => {
    auth.verifyJwt.returns(null);
    const res = await fetch(`${base}/api/me`);
    expect(res.status).toBe(401);
  });

  it("GET /api/me autenticado → perfil + uso", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    users.findByIdentity.resolves(authedUser());
    plans.usage.resolves({ plan: "free", monthCount: 3, limit: 50 });

    const res = await fetch(`${base}/api/me`, { headers: { Authorization: "Bearer jwt" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("free");
    expect(body.usage.monthCount).toBe(3);
  });

  it("GET /api/report autenticado", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    users.findByIdentity.resolves(authedUser());
    reports.dashboard.resolves({ current: {}, last: {}, monthly: [] } as any);

    const res = await fetch(`${base}/api/report`, { headers: { Authorization: "Bearer jwt" } });
    expect(res.status).toBe(200);
    expect(reports.dashboard.calledWith("u1")).toBe(true);
  });

  it("GET /api/export.csv devolve o CSV como anexo", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    users.findByIdentity.resolves(authedUser());
    exports.purchasesCsv.resolves("Data,Total\n2026-06-01,10.00");

    const res = await fetch(`${base}/api/export.csv`, { headers: { Authorization: "Bearer jwt" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("alfred-compras.csv");
    expect(await res.text()).toContain("Data,Total");
  });

  it("PATCH /api/profile atualiza o nome", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    users.findByIdentity.resolves(authedUser());
    users.setNameById.resolves();

    const res = await fetch(`${base}/api/profile`, {
      method: "PATCH",
      headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo Nome" }),
    });
    expect(res.status).toBe(200);
    expect(users.setNameById.calledWith("u1", "Novo Nome")).toBe(true);
  });

  it("DELETE /api/account exclui a conta", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    users.findByIdentity.resolves(authedUser());
    accounts.deleteAccount.resolves({ purchases: 2, reminders: 1 });

    const res = await fetch(`${base}/api/account`, {
      method: "DELETE",
      headers: { Authorization: "Bearer jwt" },
    });
    expect(res.status).toBe(200);
    expect(accounts.deleteAccount.calledOnce).toBe(true);
  });

  it("GET /auth/link/telegram redireciona ao t.me", async () => {
    auth.verifyJwt.returns({ sub: "wos1" });
    linkTokens.issue.returns("LINKTOK");
    config.telegramBotUsername = "AlfredBot";

    const res = await fetch(`${base}/auth/link/telegram?token=jwt`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://t.me/AlfredBot?start=LINKTOK");
  });

  it("OPTIONS responde 204 (CORS preflight)", async () => {
    const res = await fetch(`${base}/api/me`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
  });
});
