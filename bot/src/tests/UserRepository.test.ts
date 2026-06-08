import "reflect-metadata";
import { UserRepository } from "../repositories/UserRepository";
import { UserModel } from "../models/User";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

describe("UserRepository (mongo em memória)", () => {
  const repo = new UserRepository();

  beforeAll(async () => {
    await connectMemoryMongo();
  }, 120000);
  afterAll(async () => {
    await disconnectMemoryMongo();
  });
  beforeEach(async () => {
    await clearCollections();
  });

  it("cria e acha por identidade", async () => {
    await repo.create({ identities: [{ platform: "web", externalId: "w1" }], status: "complete" });
    const found = await repo.findByIdentity("web", "w1");
    expect(found?.status).toBe("complete");
  });

  it("acha usuário legado do Telegram pelo telegramId", async () => {
    await repo.create({ identities: [], telegramId: "123", status: "complete" });
    const found = await repo.findByIdentity("telegram", "123");
    expect(found).not.toBeNull();
  });

  it("atualiza por identidade", async () => {
    await repo.create({
      identities: [{ platform: "web", externalId: "w1" }],
      status: "awaiting_name",
    });
    const updated = await repo.updateByIdentity("web", "w1", { name: "Yves", status: "complete" });
    expect(updated?.name).toBe("Yves");
    expect(updated?.status).toBe("complete");
  });

  it("busca por identificador verificado, excluindo o próprio _id", async () => {
    const a = await repo.create({
      identities: [{ platform: "web", externalId: "w1" }],
      status: "complete",
      verifiedEmail: "a@b.com",
    });
    const b = await repo.create({
      identities: [{ platform: "telegram", externalId: "t1" }],
      status: "complete",
      verifiedEmail: "a@b.com",
    });

    // sem excludeId, acha algum; com excludeId = a, acha o b (o "gêmeo")
    const twin = await repo.findByVerifiedEmail("a@b.com", String(a._id));
    expect(String(twin?._id)).toBe(String(b._id));
  });

  it("findById / updateById / deleteById", async () => {
    const u = await repo.create({
      identities: [{ platform: "web", externalId: "w1" }],
      status: "complete",
    });
    const id = String(u._id);

    expect((await repo.findById(id))?.status).toBe("complete");
    expect((await repo.updateById(id, { plan: "pro" }))?.plan).toBe("pro");
    await repo.deleteById(id);
    expect(await repo.findById(id)).toBeNull();
  });

  it("deleteByIdentity remove o documento", async () => {
    await repo.create({ identities: [{ platform: "web", externalId: "w1" }], status: "complete" });
    await repo.deleteByIdentity("web", "w1");
    expect(await repo.findByIdentity("web", "w1")).toBeNull();
  });

  it("findAnonymousInactive: só web anônimo, sem login, e inativo (LGPD)", async () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const backdate = async (id: unknown) =>
      UserModel.collection.updateOne({ _id: id as never }, { $set: { updatedAt: old } });

    const anon = await repo.create({
      identities: [{ platform: "web", externalId: "w1" }],
      status: "complete",
    });
    await backdate(anon._id);

    // logado (verifiedEmail) — não deve entrar
    const logged = await repo.create({
      identities: [{ platform: "web", externalId: "w2" }],
      status: "complete",
      verifiedEmail: "a@b.com",
    });
    await backdate(logged._id);

    // Telegram — não deve entrar
    const tg = await repo.create({
      identities: [{ platform: "telegram", externalId: "t1" }],
      status: "complete",
    });
    await backdate(tg._id);

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const found = await repo.findAnonymousInactive(cutoff);
    expect(found.map((u) => String(u._id))).toEqual([String(anon._id)]);
  });
});
