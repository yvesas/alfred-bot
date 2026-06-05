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
