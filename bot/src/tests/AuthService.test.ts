import "reflect-metadata";
import { AuthService } from "../services/AuthService";
import { UserRepository } from "../repositories/UserRepository";
import { config } from "../infra/config";
import sinon from "sinon";

// O AuthService passou a consultar o repositório para saber se a sessão ainda é a
// corrente (C8). Estes testes cobrem só a parte de JWT, então o repositório é um stub.
const userRepo = sinon.createStubInstance(UserRepository);

describe("AuthService (JWT)", () => {
  let auth: AuthService;

  beforeEach(() => {
    config.jwtSecret = "test-secret";
    auth = new AuthService(userRepo);
  });

  it("emite e valida um JWT (roundtrip)", () => {
    const token = auth.issueJwt({ id: "user_123", email: "a@b.com", name: "Yves" });
    const session = auth.verifyJwt(token);
    expect(session?.sub).toBe("user_123");
    expect(session?.email).toBe("a@b.com");
    expect(session?.name).toBe("Yves");
  });

  it("retorna null para token inválido", () => {
    expect(auth.verifyJwt("not-a-jwt")).toBeNull();
    expect(auth.verifyJwt("")).toBeNull();
  });

  it("retorna null quando não há segredo configurado", () => {
    const token = auth.issueJwt({ id: "u" });
    config.jwtSecret = "";
    expect(new AuthService(userRepo).verifyJwt(token)).toBeNull();
  });

  it("canVerifyEmail reflete a presença de API key + client id", () => {
    const apiKey = config.workosApiKey;
    const clientId = config.workosClientId;

    config.workosApiKey = "sk_test";
    config.workosClientId = "client_x";
    expect(new AuthService(userRepo).canVerifyEmail()).toBe(true);

    config.workosApiKey = "";
    expect(new AuthService(userRepo).canVerifyEmail()).toBe(false);

    config.workosApiKey = apiKey;
    config.workosClientId = clientId;
  });
});
