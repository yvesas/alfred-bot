import "reflect-metadata";
import { AuthService } from "../services/AuthService";
import { config } from "../infra/config";

describe("AuthService (JWT)", () => {
  let auth: AuthService;

  beforeEach(() => {
    config.jwtSecret = "test-secret";
    auth = new AuthService();
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
    expect(new AuthService().verifyJwt(token)).toBeNull();
  });
});
