/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import { inject, injectable } from "inversify";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { IMessagingAdapter } from "../../core/IMessagingAdapter";
import { IncomingMessage } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { BotCore } from "../../core/BotCore";
import { OutboundRegistry, OutboundSender } from "../../core/OutboundRegistry";
import { AuthService } from "../../services/AuthService";
import { KNOWN_COMMANDS } from "../../core/commands";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";

// Mensagens enviadas do servidor para o cliente.
export type WebOutbound =
  | { type: "bot_message"; text: string }
  | { type: "typing"; value: boolean }
  | { type: "error"; message: string }
  | { type: "download"; filename: string; mimeType: string; content: string }; // content em base64

// Tamanho máximo do payload (texto + base64 da imagem) — proteção básica.
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

// Adapter do chat web via WebSocket (lib `ws`). Normaliza as mensagens do navegador para
// IncomingMessage (platform "web", externalId = clientId anônimo) e delega ao BotCore.
@injectable()
export class WebAdapter implements IMessagingAdapter, OutboundSender {
  private wss?: WebSocketServer;

  // Conexões abertas, indexadas pelo clientId (externalId anônimo). Um cliente pode ter
  // várias abas/sockets. Usado pelo push (sendTo) — ex.: lembretes.
  private readonly clients = new Map<string, Set<WebSocket>>();
  private readonly socketClient = new Map<WebSocket, string>();

  constructor(
    @inject(BotCore) private core: BotCore,
    @inject(OutboundRegistry) private outbound: OutboundRegistry,
    @inject(AuthService) private auth: AuthService,
  ) {}

  // Push: entrega a todos os sockets abertos do clientId. false se ninguém estiver online
  // (web push real, com Service Worker, fica para depois — aqui depende da aba aberta).
  async sendTo(externalId: string, text: string): Promise<boolean> {
    const sockets = this.clients.get(externalId);
    if (!sockets || sockets.size === 0) return false;

    let delivered = false;
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        this.send(socket, { type: "bot_message", text });
        delivered = true;
      }
    }
    return delivered;
  }

  async start(): Promise<void> {
    this.outbound.register("web", this);
    this.wss = new WebSocketServer({
      port: config.webPort,
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: (info: { origin: string }) => this.isAllowedOrigin(info.origin),
    });

    this.wss.on("connection", (socket) => {
      socket.on("message", (raw) => void this.onMessage(socket, raw));
      socket.on("error", (err) => logger.error({ err }, "Erro no socket web"));
      socket.on("close", () => this.unbindSocket(socket));
    });

    logger.info(`🌐 Web (WebSocket) adapter em :${config.webPort}`);
  }

  async stop(): Promise<void> {
    this.wss?.close();
  }

  // Associa o socket ao clientId (descoberto na 1ª mensagem) para permitir push depois.
  private bindSocket(socket: WebSocket, clientId: string): void {
    if (this.socketClient.get(socket) === clientId) return;
    this.socketClient.set(socket, clientId);
    let set = this.clients.get(clientId);
    if (!set) {
      set = new Set();
      this.clients.set(clientId, set);
    }
    set.add(socket);
  }

  private unbindSocket(socket: WebSocket): void {
    const clientId = this.socketClient.get(socket);
    if (!clientId) return;
    this.socketClient.delete(socket);
    const set = this.clients.get(clientId);
    set?.delete(socket);
    if (set && set.size === 0) this.clients.delete(clientId);
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
    await this.processRaw(
      raw.toString(),
      (msg) => this.send(socket, msg),
      (clientId) => this.bindSocket(socket, clientId),
    );
  }

  // Processa uma mensagem crua e emite as respostas via `send` (testável sem socket real).
  // `bind` (opcional) recebe o clientId para registrar a conexão para push.
  async processRaw(
    raw: string,
    send: (msg: WebOutbound) => void,
    bind?: (clientId: string) => void,
  ): Promise<void> {
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

    bind?.(incoming.externalId);

    const reply: Replier = {
      text: async (text: string) => send({ type: "bot_message", text }),
      document: async (content: Buffer, filename: string, mimeType: string) =>
        send({ type: "download", filename, mimeType, content: content.toString("base64") }),
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

    // Com um JWT válido, a identidade canônica passa a ser o id do WorkOS (sub);
    // sem token (ou inválido), segue anônimo pelo clientId.
    const session = typeof payload?.token === "string" ? this.auth.verifyJwt(payload.token) : null;
    const externalId = session?.sub ?? clientId;

    if (payload.type === "user_photo" && typeof payload.imageBase64 === "string") {
      const image = payload.imageBase64;
      return {
        platform: "web",
        externalId,
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
            externalId,
            kind: "command",
            command: { name, args },
          };
        }
      }
      return { platform: "web", externalId, kind: "text", text };
    }

    return null;
  }

  private send(socket: WebSocket, msg: WebOutbound): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}
