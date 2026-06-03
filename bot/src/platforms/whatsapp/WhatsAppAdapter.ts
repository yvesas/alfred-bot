import "reflect-metadata";
import { inject, injectable } from "inversify";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import { IMessagingAdapter } from "../../core/IMessagingAdapter";
import { IncomingMessage } from "../../core/IncomingMessage";
import { Replier } from "../../core/Replier";
import { BotCore } from "../../core/BotCore";
import { config } from "../../infra/config";
import { logger } from "../../infra/logger";

// Comandos reconhecidos (mesma lógica do Telegram: só estes viram "command"; o resto é texto).
const KNOWN_COMMANDS = ["start", "compras", "gastos", "ia"];

// Baileys é bem verboso — usa um logger próprio só para erros.
const waLogger = pino({ level: "error" });

// Adapter do WhatsApp via Baileys (lib gratuita, login por QR). Normaliza eventos para
// IncomingMessage e delega ao BotCore. Não contém regra de conversa.
@injectable()
export class WhatsAppAdapter implements IMessagingAdapter {
  private sock?: WASocket;
  private stopping = false;

  constructor(@inject(BotCore) private core: BotCore) {}

  async start(): Promise<void> {
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.sock?.end(undefined);
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(config.whatsappSessionDir);
    const sock = makeWASocket({ auth: state, logger: waLogger });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        logger.info("📱 WhatsApp: escaneie o QR code abaixo para conectar");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        logger.info("🚀 WhatsApp adapter conectado");
      } else if (connection === "close") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;

        if (loggedOut) {
          logger.error("WhatsApp deslogado — apague a sessão e reconecte (novo QR).");
        } else if (!this.stopping) {
          logger.warn("WhatsApp desconectado; reconectando...");
          void this.connect();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        try {
          await this.onMessage(m);
        } catch (err) {
          logger.error({ err }, "Erro ao processar mensagem do WhatsApp");
        }
      }
    });
  }

  private async onMessage(m: WAMessage): Promise<void> {
    const jid = m.key.remoteJid;
    // Apenas mensagens diretas (ignora grupos, status e as próprias).
    if (!jid || m.key.fromMe || !jid.endsWith("@s.whatsapp.net")) return;

    const externalId = jid.split("@")[0];
    const incoming = this.toIncoming(externalId, m);
    if (!incoming) return;

    await this.core.handle(incoming, this.replier(jid));
  }

  private toIncoming(externalId: string, m: WAMessage): IncomingMessage | null {
    if (m.message?.imageMessage) {
      return {
        platform: "whatsapp",
        externalId,
        kind: "photo",
        getImageBase64: () => this.downloadImage(m),
      };
    }

    const text = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? undefined;
    if (text === undefined || text === null) return null;

    if (text.startsWith("/")) {
      const [first, ...args] = text.slice(1).trim().split(/\s+/);
      const name = first.toLowerCase();
      if (KNOWN_COMMANDS.includes(name)) {
        return { platform: "whatsapp", externalId, kind: "command", command: { name, args } };
      }
    }

    return { platform: "whatsapp", externalId, kind: "text", text };
  }

  private replier(jid: string): Replier {
    return {
      text: async (message: string) => {
        await this.sock?.sendMessage(jid, { text: message });
      },
    };
  }

  private async downloadImage(m: WAMessage): Promise<string> {
    const buffer = await downloadMediaMessage(
      m,
      "buffer",
      {},
      { logger: waLogger, reuploadRequest: this.sock!.updateMediaMessage },
    );
    return (buffer as Buffer).toString("base64");
  }
}
