import "reflect-metadata";
import sinon from "sinon";
import { AuthService } from "../services/AuthService";
import { UserRepository } from "../repositories/UserRepository";
import { UserService } from "../services/UserService";
import { IUser } from "../models/User";
import { config } from "../infra/config";

// C8 — o JWT vale 30 dias e o `logout` só limpava o `localStorage`: o servidor
// continuava aceitando o token. Sem revogação não há como atender a um pedido do
// titular (LGPD), nem como reagir a um token vazado.
//
// A versão da sessão vai dentro do token; incrementar a do usuário derruba de uma vez
// todos os que já foram emitidos, sem precisar rastreá-los.
describe("revogação de sessão (C8)", () => {
  let auth: AuthService;
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;

  const profile = { id: "wos_1", email: "ana@exemplo.com", name: "Ana" };
  const user = (tokenVersion?: number) => ({ tokenVersion }) as IUser;

  beforeEach(() => {
    config.jwtSecret = "test-secret";
    userRepo = sinon.createStubInstance(UserRepository);
    auth = new AuthService(userRepo);
  });

  afterEach(() => sinon.restore());

  describe("AuthService.isCurrent", () => {
    it("aceita o token emitido na versão atual", () => {
      const token = auth.issueJwt(profile, 3);
      const session = auth.verifyJwt(token)!;

      expect(auth.isCurrent(session, user(3))).toBe(true);
    });

    // O caso que importa: o token continua assinado e dentro da validade, mas o
    // usuário revogou.
    it("recusa o token de antes da revogação", () => {
      const token = auth.issueJwt(profile, 3);
      const session = auth.verifyJwt(token)!;

      expect(auth.isCurrent(session, user(4))).toBe(false);
    });

    // Tokens emitidos antes desta mudança não têm `v`. Derrubá-los todos de uma vez
    // deslogaria a base inteira sem motivo — eles expiram sozinhos.
    it("trata token sem versão como versão zero", () => {
      const legacy = { sub: "wos_1" };

      expect(auth.isCurrent(legacy, user(undefined))).toBe(true);
      expect(auth.isCurrent(legacy, user(0))).toBe(true);
      expect(auth.isCurrent(legacy, user(1))).toBe(false);
    });

    it("a versão sobrevive ao roundtrip do JWT", () => {
      const session = auth.verifyJwt(auth.issueJwt(profile, 7))!;

      expect(session.v).toBe(7);
      expect(session.sub).toBe("wos_1");
    });
  });

  describe("AuthService.resolveCurrentSession", () => {
    it("devolve a sessão quando ela é a corrente", async () => {
      userRepo.findByIdentity.resolves(user(2));
      const token = auth.issueJwt(profile, 2);

      expect(await auth.resolveCurrentSession(token)).toMatchObject({ sub: "wos_1", v: 2 });
    });

    it("devolve null quando a sessão foi revogada", async () => {
      userRepo.findByIdentity.resolves(user(5));
      const token = auth.issueJwt(profile, 2);

      expect(await auth.resolveCurrentSession(token)).toBeNull();
    });

    // Conta apagada: o token continua assinado, mas não há dono.
    it("devolve null quando o usuário não existe mais", async () => {
      userRepo.findByIdentity.resolves(null);

      expect(await auth.resolveCurrentSession(auth.issueJwt(profile, 0))).toBeNull();
    });

    it("devolve null para token inválido, sem consultar o banco", async () => {
      expect(await auth.resolveCurrentSession("nao-e-um-jwt")).toBeNull();
      expect(userRepo.findByIdentity.called).toBe(false);
    });
  });

  describe("UserService.revokeSessions", () => {
    it("incrementa a versão do usuário", async () => {
      const service = new UserService(userRepo);
      userRepo.bumpTokenVersion.resolves(1);

      await service.revokeSessions("u1");

      expect(userRepo.bumpTokenVersion.calledOnceWith("u1")).toBe(true);
    });
  });
});
