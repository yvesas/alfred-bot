import { Registry, collectDefaultMetrics, Counter } from "prom-client";

// Registry de métricas exposto em GET /metrics (formato Prometheus).
// Pronto para Prometheus scrapear e Grafana visualizar.
export const registry = new Registry();

// Métricas padrão do processo Node (CPU, memória, event loop, GC, ...).
collectDefaultMetrics({ register: registry, prefix: "alfred_bot_" });

// ---- Métricas da aplicação ----

export const messagesReceivedTotal = new Counter({
  name: "alfred_bot_messages_received_total",
  help: "Total de mensagens recebidas dos usuários",
  labelNames: ["platform", "kind"] as const,
  registers: [registry],
});

export const purchasesRegisteredTotal = new Counter({
  name: "alfred_bot_purchases_registered_total",
  help: "Total de compras registradas com sucesso",
  registers: [registry],
});

export const aiErrorsTotal = new Counter({
  name: "alfred_bot_ai_errors_total",
  help: "Total de erros ao processar mensagens/imagens com a IA",
  registers: [registry],
});
