import "reflect-metadata";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startHealthServer, setAppReady } from "../infra/health";

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on("error", reject);
  });
}

describe("health server", () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    server = startHealthServer(0); // porta efêmera
    server.on("listening", () => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  it("liveness /health returns 200", async () => {
    const res = await get(port, "/health");
    expect(res.status).toBe(200);
  });

  it("readiness /ready returns 503 when app not ready / DB down", async () => {
    setAppReady(false);
    const res = await get(port, "/ready");
    expect(res.status).toBe(503);
  });

  it("/metrics exposes Prometheus metrics", async () => {
    const res = await get(port, "/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toContain("alfred_bot_");
  });
});
