import http from "node:http";
import mongoose from "mongoose";
import { config } from "./config";
import { logger } from "./logger";
import { registry } from "./metrics";

let appReady = false;

// Marca a aplicação como pronta (chamado após o setup completo no index.ts).
export function setAppReady(ready: boolean): void {
  appReady = ready;
}

// Servidor HTTP mínimo de health para o orquestrador (Docker/k8s/PaaS):
//   GET /health  -> liveness  (processo no ar)
//   GET /ready   -> readiness (app pronta + MongoDB conectado)
//   GET /metrics -> métricas Prometheus
export function startHealthServer(port: number = config.healthPort): http.Server {
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url === "/ready") {
      const dbReady = mongoose.connection.readyState === 1;
      const ready = appReady && dbReady;
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: ready ? "ready" : "not_ready", db: dbReady }));
      return;
    }

    if (url === "/metrics") {
      // Endpoint para o Prometheus scrapear (Grafana visualiza por cima).
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "Content-Type": registry.contentType });
          res.end(body);
        })
        .catch((err) => {
          logger.error({ err }, "Erro ao gerar métricas");
          res.writeHead(500);
          res.end();
        });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    const addr = server.address();
    const boundPort = typeof addr === "object" && addr ? addr.port : port;
    logger.info(`🩺 Health server em :${boundPort} (/health, /ready, /metrics)`);
  });

  return server;
}
