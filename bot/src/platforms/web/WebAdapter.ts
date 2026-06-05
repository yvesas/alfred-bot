/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { inject, injectable } from "inversify";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { IMessagingAdapter } from "../../core/IMessagingAdapter";
import { IncomingMessage } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { BotCore } from "../../core/BotCore";
import { KNOWN_COMMANDS } from "../../core/commands";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";

// Mensagens enviadas do servidor para o cliente.
export type WebOutbound =
  | { type: "bot_message"; text: string }
  | { type: "typing"; value: boolean }
  | { type: "error"; message: string };

// Tamanho máximo do payload (texto + base64 da imagem) — proteção básica.
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

// Adapter do chat web via WebSocket (lib `ws`). Normaliza as mensagens do navegador para
// IncomingMessage (platform "web", externalId = clientId anônimo) e delega ao BotCore.
@injectable()
export class WebAdapter implements IMessagingAdapter {
  private wss?: WebSocketServer;

  constructor(@inject(BotCore) private core: BotCore) {}

  async start(): Promise<void> {
    this.wss = new WebSocketServer({
      port: config.webPort,
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: (info: { origin: string }) => this.isAllowedOrigin(info.origin),
    });

    this.wss.on("connection", (socket) => {
      socket.on("message", (raw) => void this.onMessage(socket, raw));
      socket.on("error", (err) => logger.error({ err }, "Erro no socket web"));
    });

    logger.info(`🌐 Web (WebSocket) adapter em :${config.webPort}`);
  }

  async stop(): Promise<void> {
    this.wss?.close();
  }

  // Checa o header Origin contra a allowlist (defesa cross-site).
  private isAllowedOrigin(origin?: string): boolean {
    const allowed = config.webAllowedOrigin;
    if (!allowed || allowed === "*") return true;
    return allowed
      .split(",")
      .map((o) => o.trim())
      .includes(origin ?? "");
  }

  private async onMessage(socket: WebSocket, raw: RawData): Promise<void> {
    await this.processRaw(raw.toString(), (msg) => this.send(socket, msg));
  }

  // Processa uma mensagem crua e emite as respostas via `send` (testável sem socket real).
  async processRaw(raw: string, send: (msg: WebOutbound) => void): Promise<void> {
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      send({ type: "error", message: "Mensagem inválida (JSON)." });
      return;
    }

    const incoming = this.toIncoming(payload);
    if (!incoming) {
      send({ type: "error", message: "Mensagem inválida." });
      return;
    }

    const reply: Replier = {
      text: async (text: string) => send({ type: "bot_message", text }),
    };

    send({ type: "typing", value: true });
    try {
      await this.core.handle(incoming, reply);
    } catch (err) {
      logger.error({ err }, "Erro ao processar mensagem web");
      send({ type: "error", message: "Erro ao processar a mensagem." });
    } finally {
      send({ type: "typing", value: false });
    }
  }

  private toIncoming(payload: any): IncomingMessage | null {
    const clientId = typeof payload?.clientId === "string" ? payload.clientId.trim() : "";
    if (!clientId) return null;

    if (payload.type === "user_photo" && typeof payload.imageBase64 === "string") {
      const image = payload.imageBase64;
      return {
        platform: "web",
        externalId: clientId,
        kind: "photo",
        getImageBase64: async () => image,
      };
    }

    if (payload.type === "user_message" && typeof payload.text === "string") {
      const text: string = payload.text;
      if (text.startsWith("/")) {
        const [first, ...args] = text.slice(1).trim().split(/\s+/);
        const name = first.toLowerCase();
        if (KNOWN_COMMANDS.includes(name)) {
          return {
            platform: "web",
            externalId: clientId,
            kind: "command",
            command: { name, args },
          };
        }
      }
      return { platform: "web", externalId: clientId, kind: "text", text };
    }

    return null;
  }

  private send(socket: WebSocket, msg: WebOutbound): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}
