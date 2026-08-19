import { inject, injectable } from "inversify";
import { WorkOS } from "@workos-inc/node";
import jwt from "jsonwebtoken";
import { IUser } from "../models/User";
import { UserRepository } from "../repositories/UserRepository";
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
  /** Versão da sessão no momento da emissão. Ver `isCurrent` e C8. */
  v?: number;
}

// Encapsula o WorkOS AuthKit (login hospedado) e a emissão/validação do JWT de sessão.
// Tolerante quando não configurado: só os métodos que exigem o WorkOS lançam.
@injectable()
export class AuthService {
  private readonly workos?: WorkOS;

  constructor(@inject(UserRepository) private userRepo: UserRepository) {
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

  // `tokenVersion` é gravado no token para permitir revogação em massa: basta
  // incrementar o do usuário e todo token já emitido deixa de ser corrente (C8).
  issueJwt(profile: AuthProfile, tokenVersion = 0): string {
    const payload: SessionToken = {
      sub: profile.id,
      email: profile.email,
      name: profile.name,
      v: tokenVersion,
    };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
  }

  /**
   * A sessão ainda é a corrente deste usuário?
   *
   * Assinatura válida não basta: um token roubado continua assinado. Isto compara a
   * versão gravada no token com a do usuário — se ele pediu revogação, a do usuário
   * subiu e o token para de valer, mesmo dentro dos 30 dias.
   *
   * Ausente conta como 0, para os tokens emitidos antes desta mudança continuarem
   * valendo até expirarem sozinhos.
   */
  isCurrent(session: SessionToken, user: Pick<IUser, "tokenVersion">): boolean {
    return (session.v ?? 0) === (user.tokenVersion ?? 0);
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

  /**
   * Valida a assinatura **e** confere se a sessão ainda é a corrente do usuário.
   *
   * Para quem não tem o usuário em mãos — o adapter do chat web, por exemplo. Quem já
   * carregou o usuário deve usar `verifyJwt` + `isCurrent` e poupar a consulta.
   */
  async resolveCurrentSession(token: string): Promise<SessionToken | null> {
    const session = this.verifyJwt(token);
    if (!session) return null;

    const user = await this.userRepo.findByIdentity("web", session.sub);
    if (!user || !this.isCurrent(session, user)) return null;
    return session;
  }

  verifyJwt(token: string): SessionToken | null {
    if (!config.jwtSecret || !token) return null;
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (typeof decoded === "string" || !decoded.sub) return null;
      return { sub: String(decoded.sub), email: decoded.email, name: decoded.name, v: decoded.v };
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
