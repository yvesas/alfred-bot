import { injectable } from "inversify";
import { WorkOS } from "@workos-inc/node";
import jwt from "jsonwebtoken";
import { config } from "../infra/config";

// Perfil retornado pelo WorkOS após o login.
export interface AuthProfile {
  id: string; // id estável do usuário no WorkOS
  email?: string;
  name?: string;
}

// Conteúdo do JWT de sessão emitido pelo bot.
export interface SessionToken {
  sub: string; // id do usuário no WorkOS (identidade canônica do web)
  email?: string;
  name?: string;
}

// Encapsula o WorkOS AuthKit (login hospedado) e a emissão/validação do JWT de sessão.
// Tolerante quando não configurado: só os métodos que exigem o WorkOS lançam.
@injectable()
export class AuthService {
  private readonly workos?: WorkOS;

  constructor() {
    if (config.workosApiKey) {
      this.workos = new WorkOS(config.workosApiKey);
    }
  }

  // URL do AuthKit; `state` carrega o clientId anônimo para o merge pós-login.
  getAuthorizationUrl(state: string): string {
    return this.client().userManagement.getAuthorizationUrl({
      provider: "authkit",
      clientId: config.workosClientId,
      redirectUri: config.workosRedirectUri,
      state,
    });
  }

  // Troca o `code` do callback pelo perfil do usuário.
  async authenticate(code: string): Promise<AuthProfile> {
    const { user } = await this.client().userManagement.authenticateWithCode({
      clientId: config.workosClientId,
      code,
    });
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return { id: user.id, email: user.email ?? undefined, name: name || undefined };
  }

  issueJwt(profile: AuthProfile): string {
    const payload: SessionToken = { sub: profile.id, email: profile.email, name: profile.name };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
  }

  // Magic Auth disponível (e-mail por código) — basta API key + client id, sem redirect/JWT.
  canVerifyEmail(): boolean {
    return !!(config.workosApiKey && config.workosClientId);
  }

  // Envia um código de verificação para o e-mail (WorkOS Magic Auth).
  async sendEmailCode(email: string): Promise<void> {
    await this.client().userManagement.createMagicAuth({ email: email.trim().toLowerCase() });
  }

  // Valida o código e retorna o perfil do WorkOS (para o login web). null em qualquer falha.
  async authenticateEmail(email: string, code: string): Promise<AuthProfile | null> {
    try {
      const { user } = await this.client().userManagement.authenticateWithMagicAuth({
        clientId: config.workosClientId,
        email: email.trim().toLowerCase(),
        code: code.trim(),
      });
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      return { id: user.id, email: user.email ?? undefined, name: name || undefined };
    } catch {
      return null;
    }
  }

  // Valida o código do e-mail (usado na verificação do chat). true se autenticou.
  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    return (await this.authenticateEmail(email, code)) !== null;
  }

  verifyJwt(token: string): SessionToken | null {
    if (!config.jwtSecret || !token) return null;
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (typeof decoded === "string" || !decoded.sub) return null;
      return { sub: String(decoded.sub), email: decoded.email, name: decoded.name };
    } catch {
      return null;
    }
  }

  private client(): WorkOS {
    if (!this.workos) {
      throw new Error("WorkOS não configurado (WORKOS_API_KEY ausente).");
    }
    return this.workos;
  }
}
