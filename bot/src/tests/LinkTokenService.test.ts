import "reflect-metadata";
import { LinkTokenService } from "../services/LinkTokenService";
import { FakeConversationStore } from "./helpers/fakeConversationStore";

// Antes, o serviço tinha o próprio Map e recebia `now` para simular o relógio. Desde o
// C2 ele delega ao store compartilhado, então o teste passa a exercitar o contrato:
// emite, consome uma vez só, e não conhece token alheio. A expiração de verdade
// (índice de TTL do Mongo) é provada em `ConversationStateStore.test.ts`.
describe("LinkTokenService", () => {
  let svc: LinkTokenService;
  let store: FakeConversationStore;

  beforeEach(() => {
    store = new FakeConversationStore();
    svc = new LinkTokenService(store);
  });

  it("emite e consome (uso único)", async () => {
    const token = await svc.issue("user_1");

    expect(await svc.consume(token)).toBe("user_1");
    expect(await svc.consume(token)).toBeNull(); // já consumido
  });

  it("token desconhecido → null", async () => {
    expect(await svc.consume("nope")).toBeNull();
  });

  it("token vazio → null, sem ir ao store", async () => {
    expect(await svc.consume("")).toBeNull();
  });

  // Cabe no payload do `t.me?start=`, que tem limite de 64 caracteres.
  it("emite token curto e url-safe", async () => {
    const token = await svc.issue("user_1");

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThanOrEqual(16);
  });

  it("cada emissão gera um token diferente", async () => {
    const a = await svc.issue("user_1");
    const b = await svc.issue("user_1");

    expect(a).not.toBe(b);
    // E os dois valem — reemitir não invalida o anterior.
    expect(await svc.consume(a)).toBe("user_1");
    expect(await svc.consume(b)).toBe("user_1");
  });

  it("consumir o token de um usuário não afeta o de outro", async () => {
    const one = await svc.issue("user_1");
    const two = await svc.issue("user_2");

    await svc.consume(one);

    expect(await svc.consume(two)).toBe("user_2");
  });
});
