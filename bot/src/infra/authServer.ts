import http from "node:http";
import { inject, injectable } from "inversify";
import { AuthService } from "../services/AuthService";
import { AccountService } from "../services/AccountService";
import { LinkTokenService } from "../services/LinkTokenService";
import { config } from "./config";
import { logger } from "./logger";

// Servidor HTTP do login web (WorkOS AuthKit):
//   GET /auth/login?clientId=<anon>  -> redireciona ao AuthKit (state carrega o clientId anônimo)
//   GET /auth/callback?code=&state=  -> troca o code, garante a conta, absorve o anônimo,
//                                       emite o JWT e redireciona ao app web com ?token=
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
      logger.info(`🔐 Auth server em :${port} (/auth/login, /auth/callback)`);
    });
    return this.server;
  }

  stop(): void {
    this.server?.close();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/auth/login") return this.login(url, res);
    if (url.pathname === "/auth/callback") return this.callback(url, res);
    if (url.pathname === "/auth/link/telegram") return this.link(url, res, "telegram");
    if (url.pathname === "/auth/link/whatsapp") return this.link(url, res, "whatsapp");
    res.writeHead(404);
    res.end();
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
