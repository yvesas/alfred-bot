import http from "node:http";
import { inject, injectable } from "inversify";
import { AuthService } from "../services/AuthService";
import { AccountService } from "../services/AccountService";
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
    res.writeHead(404);
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
