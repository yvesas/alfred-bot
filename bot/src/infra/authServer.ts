import http from "node:http";
import { inject, injectable } from "inversify";
import { AuthService } from "../services/AuthService";
import { AccountService } from "../services/AccountService";
import { LinkTokenService } from "../services/LinkTokenService";
import { config } from "./config";
import { logger } from "./logger";

// Servidor HTTP do login web. Fluxo principal: telas PRÓPRIAS de e-mail + OTP (WorkOS Magic Auth):
//   POST /auth/email/start   { email }                 -> envia o código por e-mail
//   POST /auth/email/verify  { email, code, clientId } -> valida, garante a conta, absorve o
//                                                          anônimo e devolve { token } (JWT)
// Vínculo cross-plataforma:
//   GET  /auth/link/telegram|whatsapp?token=<jwt>       -> 302 ao deep-link (t.me/wa.me)
// Fluxo hospedado/social (opcional, legado): GET /auth/login + GET /auth/callback.
@injectable()
export class AuthServer {
  private server?: http.Server;

  constructor(
    @inject(AuthService) private auth: AuthService,
    @inject(AccountService) private accounts: AccountService,
    @inject(LinkTokenService) private linkTokens: LinkTokenService,
  ) {}

  start(port: number = config.authPort): http.Server {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    this.server.listen(port, () => {
      logger.info(
        `🔐 Auth server em :${port} (/auth/email/start, /auth/email/verify, /auth/link/*)`,
      );
    });
    return this.server;
  }

  stop(): void {
    this.server?.close();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/auth/email/start") {
      return this.emailStart(req, res);
    }
    if (req.method === "POST" && url.pathname === "/auth/email/verify") {
      return this.emailVerify(req, res);
    }
    if (url.pathname === "/auth/login") return this.login(url, res);
    if (url.pathname === "/auth/callback") return this.callback(url, res);
    if (url.pathname === "/auth/link/telegram") return this.link(url, res, "telegram");
    if (url.pathname === "/auth/link/whatsapp") return this.link(url, res, "whatsapp");
    res.writeHead(404);
    res.end();
  }

  // CORS para as chamadas XHR do app web (telas próprias). Origem da allowlist ou "*".
  private cors(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", config.webAppUrl || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  // ---------- Login por e-mail + OTP (Magic Auth, telas próprias) ----------

  private async emailStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      json(res, 400, { error: "missing email" });
      return;
    }
    try {
      await this.auth.sendEmailCode(email);
      json(res, 200, { ok: true });
    } catch (err) {
      logger.error({ err }, "Falha ao enviar código de login");
      json(res, 500, { error: "send failed" });
    }
  }

  private async emailVerify(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const anon = typeof body.clientId === "string" ? body.clientId : "";
    if (!email || !code) {
      json(res, 400, { error: "missing email/code" });
      return;
    }

    try {
      const profile = await this.auth.authenticateEmail(email, code);
      if (!profile) {
        json(res, 401, { error: "invalid code" });
        return;
      }
      await this.accounts.ensureWorkosUser(profile.id, {
        name: profile.name,
        email: profile.email,
      });
      if (anon) {
        await this.accounts.absorbAnonymous(profile.id, anon);
      }
      json(res, 200, { token: this.auth.issueJwt(profile) });
    } catch (err) {
      logger.error({ err }, "Falha na verificação de login");
      json(res, 500, { error: "verify failed" });
    }
  }

  // Gera um token de vínculo para o usuário logado (JWT em ?token=) e redireciona ao deep-link
  // da plataforma. O usuário inicia o contato com o bot (Start/enviar) carregando o token.
  private link(url: URL, res: http.ServerResponse, platform: "telegram" | "whatsapp"): void {
    const session = this.auth.verifyJwt(url.searchParams.get("token") ?? "");
    if (!session) {
      res.writeHead(401);
      res.end("not authenticated");
      return;
    }

    const target =
      platform === "telegram"
        ? telegramDeepLink(this.linkTokens.issue(session.sub))
        : whatsappDeepLink(this.linkTokens.issue(session.sub));

    if (!target) {
      res.writeHead(503);
      res.end(`${platform} link not configured`);
      return;
    }
    res.writeHead(302, { Location: target });
    res.end();
  }

  private login(url: URL, res: http.ServerResponse): void {
    const anon = url.searchParams.get("clientId") ?? "";
    const authUrl = this.auth.getAuthorizationUrl(encodeState({ anon }));
    res.writeHead(302, { Location: authUrl });
    res.end();
  }

  private async callback(url: URL, res: http.ServerResponse): Promise<void> {
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("missing code");
      return;
    }

    try {
      const profile = await this.auth.authenticate(code);
      const { anon } = decodeState(url.searchParams.get("state"));

      await this.accounts.ensureWorkosUser(profile.id, {
        name: profile.name,
        email: profile.email,
      });
      if (anon) {
        await this.accounts.absorbAnonymous(profile.id, anon);
      }

      const token = this.auth.issueJwt(profile);
      const base = config.webAppUrl || "/";
      const sep = base.includes("?") ? "&" : "?";
      res.writeHead(302, { Location: `${base}${sep}token=${encodeURIComponent(token)}` });
      res.end();
    } catch (err) {
      logger.error({ err }, "Falha no callback de autenticação");
      res.writeHead(500);
      res.end("auth error");
    }
  }
}

// Lê o corpo JSON da requisição (tolerante: corpo inválido vira {}).
function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // proteção básica
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Deep-links de vínculo. Vazios quando o bot username / número não está configurado.
function telegramDeepLink(linkToken: string): string | null {
  if (!config.telegramBotUsername) return null;
  return `https://t.me/${config.telegramBotUsername}?start=${linkToken}`;
}

function whatsappDeepLink(linkToken: string): string | null {
  if (!config.whatsappBotNumber) return null;
  const text = encodeURIComponent(`/vincular ${linkToken}`);
  return `https://wa.me/${config.whatsappBotNumber}?text=${text}`;
}

// State opaco (base64url de JSON) trafegado pelo WorkOS de volta ao callback.
interface AuthState {
  anon: string;
}

export function encodeState(state: AuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeState(raw: string | null): AuthState {
  if (!raw) return { anon: "" };
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return { anon: typeof parsed?.anon === "string" ? parsed.anon : "" };
  } catch {
    return { anon: "" };
  }
}
