import "reflect-metadata";
import { LinkTokenService } from "../services/LinkTokenService";

describe("LinkTokenService", () => {
  let svc: LinkTokenService;

  beforeEach(() => {
    svc = new LinkTokenService();
  });

  it("emite e consome (uso único)", () => {
    const token = svc.issue("user_1", 1000);
    expect(svc.consume(token, 1000)).toBe("user_1");
    expect(svc.consume(token, 1000)).toBeNull(); // já consumido
  });

  it("expira após o TTL (~10 min)", () => {
    const token = svc.issue("user_1", 0);
    expect(svc.consume(token, 11 * 60 * 1000)).toBeNull();
  });

  it("token desconhecido → null", () => {
    expect(svc.consume("nope", 1000)).toBeNull();
  });
});
