import "reflect-metadata";
import { ConversationStateStore } from "../core/ConversationStateStore";
import { ConversationStateModel } from "../models/ConversationState";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

// C2 — o estado de conversa saiu da memória do processo para o Mongo, para que a
// pergunta possa sair de uma réplica e a resposta chegar noutra.
//
// Estes testes usam banco de verdade porque as duas garantias que importam são dele:
// que um estado vencido não responde, e que `take` é atômico o bastante para um token
// de uso único.
describe("ConversationStateStore", () => {
  let store: ConversationStateStore;
  const MINUTE = 60_000;

  beforeAll(connectMemoryMongo);
  afterAll(disconnectMemoryMongo);
  beforeEach(async () => {
    await clearCollections();
    store = new ConversationStateStore();
  });

  it("guarda e lê", async () => {
    await store.put("email", "telegram:1", "ana@exemplo.com", MINUTE);

    expect(await store.get<string>("email", "telegram:1")).toBe("ana@exemplo.com");
  });

  it("guarda objeto inteiro, não só string", async () => {
    const purchase = { description: "Mercado", total: 90.5, items: [{ name: "arroz" }] };
    await store.put("purchase", "telegram:1", purchase, MINUTE);

    expect(await store.get<typeof purchase>("purchase", "telegram:1")).toEqual(purchase);
  });

  it("gravar de novo sobrescreve — era o que o Map fazia", async () => {
    await store.put("email", "telegram:1", "primeiro@exemplo.com", MINUTE);
    await store.put("email", "telegram:1", "segundo@exemplo.com", MINUTE);

    expect(await store.get<string>("email", "telegram:1")).toBe("segundo@exemplo.com");
    expect(await ConversationStateModel.countDocuments({ kind: "email" })).toBe(1);
  });

  it("chaves diferentes não se atrapalham", async () => {
    await store.put("email", "telegram:1", "um@exemplo.com", MINUTE);
    await store.put("email", "telegram:2", "dois@exemplo.com", MINUTE);

    expect(await store.get<string>("email", "telegram:1")).toBe("um@exemplo.com");
  });

  // O mesmo `key` em `kind` diferentes é outro estado. A conversa "telegram:1" pode ter
  // uma compra pendente E um e-mail pendente ao mesmo tempo.
  it("kinds diferentes não colidem na mesma chave", async () => {
    await store.put("email", "telegram:1", "ana@exemplo.com", MINUTE);
    await store.put("purchase", "telegram:1", { total: 7 }, MINUTE);

    expect(await store.get<string>("email", "telegram:1")).toBe("ana@exemplo.com");
    expect(await store.get<{ total: number }>("purchase", "telegram:1")).toEqual({ total: 7 });
  });

  it("chave inexistente devolve null", async () => {
    expect(await store.get("email", "nao-existe")).toBeNull();
  });

  // A garantia central: o varredor de TTL do Mongo roda a cada ~60 s, então um
  // documento vencido CONTINUA no banco por até um minuto. Se a leitura não filtrasse
  // por `expiresAt`, um token expirado ainda seria aceito nessa janela.
  it("não devolve estado vencido, mesmo antes de o Mongo varrer", async () => {
    await store.put("link", "token-velho", "user_1", -1000); // já nasceu vencido

    // Ainda está lá fisicamente...
    expect(await ConversationStateModel.countDocuments({ key: "token-velho" })).toBe(1);
    // ...mas não responde.
    expect(await store.get("link", "token-velho")).toBeNull();
    expect(await store.take("link", "token-velho")).toBeNull();
  });

  it("remove apaga", async () => {
    await store.put("email", "telegram:1", "ana@exemplo.com", MINUTE);
    await store.remove("email", "telegram:1");

    expect(await store.get("email", "telegram:1")).toBeNull();
  });

  it("remover o que não existe não estoura", async () => {
    await expect(store.remove("email", "nao-existe")).resolves.toBeUndefined();
  });

  describe("take (uso único)", () => {
    it("lê e apaga na mesma operação", async () => {
      await store.put("link", "tok", "user_1", MINUTE);

      expect(await store.take<string>("link", "tok")).toBe("user_1");
      expect(await store.take("link", "tok")).toBeNull();
    });

    // O que um token de vínculo precisa: duas réplicas consumindo o mesmo token no
    // mesmo instante, só uma pode receber o valor — senão duas contas se fundiriam
    // na mesma conta canônica a partir de um token de uso único.
    it("com cinco consumidores concorrentes, só um recebe o valor", async () => {
      await store.put("link", "tok", "user_1", MINUTE);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => store.take<string>("link", "tok")),
      );

      expect(results.filter((r) => r !== null)).toEqual(["user_1"]);
    });
  });
});
