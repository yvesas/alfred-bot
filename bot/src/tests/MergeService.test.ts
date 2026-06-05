/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import {
  MergeService,
  unionIdentities,
  mergeCategories,
  mergeBudgets,
} from "../services/MergeService";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseRepository } from "../repositories/PurchaseRepository";

describe("MergeService.mergeUsers", () => {
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;
  let purchaseRepo: sinon.SinonStubbedInstance<PurchaseRepository>;
  let service: MergeService;

  beforeEach(() => {
    userRepo = sinon.createStubInstance(UserRepository);
    purchaseRepo = sinon.createStubInstance(PurchaseRepository);
    service = new MergeService(userRepo, purchaseRepo);
  });

  it("reatribui compras por _id, une identidades/prefs e remove o secundário", async () => {
    purchaseRepo.reassignUser.resolves(2);
    userRepo.updateById.resolves({} as any);

    const primary = {
      _id: "p",
      identities: [{ platform: "telegram", externalId: "t" }],
      categories: ["A"],
      budgets: [],
    } as any;
    const secondary = {
      _id: "s",
      identities: [{ platform: "whatsapp", externalId: "w" }],
      name: "Yves",
      categories: ["B"],
      budgets: [{ category: "X", limit: 10 }],
    } as any;

    await service.mergeUsers(primary, secondary);

    expect(purchaseRepo.reassignUser.calledWith("s", "p")).toBe(true);
    const patch = userRepo.updateById.firstCall.args[1] as any;
    expect(patch.identities).toEqual([
      { platform: "telegram", externalId: "t" },
      { platform: "whatsapp", externalId: "w" },
    ]);
    expect(patch.name).toBe("Yves"); // primary não tinha → herda do secundário
    expect(patch.categories).toEqual(["A", "B"]);
    expect(userRepo.deleteById.calledWith("s")).toBe(true);
  });

  it("é no-op quando primary e secondary são o mesmo", async () => {
    const u = { _id: "x", identities: [] } as any;
    await service.mergeUsers(u, u);
    expect(purchaseRepo.reassignUser.called).toBe(false);
    expect(userRepo.deleteById.called).toBe(false);
  });
});

describe("MergeService.link*", () => {
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;
  let purchaseRepo: sinon.SinonStubbedInstance<PurchaseRepository>;
  let service: MergeService;

  beforeEach(() => {
    userRepo = sinon.createStubInstance(UserRepository);
    purchaseRepo = sinon.createStubInstance(PurchaseRepository);
    service = new MergeService(userRepo, purchaseRepo);
    userRepo.updateById.resolves({} as any);
    purchaseRepo.reassignUser.resolves(0);
  });

  it("e-mail: funde a conta de chat na conta web (login vence)", async () => {
    const current = { _id: "tg", identities: [{ platform: "telegram", externalId: "t" }] } as any;
    const web = {
      _id: "web1",
      identities: [{ platform: "web", externalId: "w" }],
      verifiedEmail: "a@b.com",
    } as any;
    userRepo.findByIdentity.withArgs("telegram", "t").resolves(current);
    userRepo.findByVerifiedEmail.withArgs("a@b.com", "tg").resolves(web);

    await service.linkVerifiedEmail("telegram", "t", "A@B.com");

    // grava o e-mail verificado no atual...
    expect(userRepo.updateById.calledWith("tg", { verifiedEmail: "a@b.com" })).toBe(true);
    // ...e funde tg → web (a conta web é primária)
    expect(purchaseRepo.reassignUser.calledWith("tg", "web1")).toBe(true);
    expect(userRepo.deleteById.calledWith("tg")).toBe(true);
  });

  it("telefone: normaliza e funde na conta já estabelecida", async () => {
    const current = {
      _id: "wa",
      identities: [{ platform: "whatsapp", externalId: "5511" }],
    } as any;
    const tg = { _id: "tg", identities: [{ platform: "telegram", externalId: "t" }] } as any;
    userRepo.findByIdentity.withArgs("whatsapp", "5511").resolves(current);
    userRepo.findByVerifiedPhone.withArgs("5511", "wa").resolves(tg);

    await service.linkVerifiedPhone("whatsapp", "5511", "+55 (11)");

    // "+55 (11)" → dígitos "5511"
    expect(userRepo.updateById.calledWith("wa", { verifiedPhone: "5511" })).toBe(true);
    expect(purchaseRepo.reassignUser.calledWith("wa", "tg")).toBe(true);
  });

  it("não funde quando não há gêmeo", async () => {
    const current = { _id: "tg", identities: [{ platform: "telegram", externalId: "t" }] } as any;
    userRepo.findByIdentity.resolves(current);
    userRepo.findByVerifiedEmail.resolves(null);

    await service.linkVerifiedEmail("telegram", "t", "a@b.com");

    expect(purchaseRepo.reassignUser.called).toBe(false);
    expect(userRepo.deleteById.called).toBe(false);
  });
});

describe("MergeService helpers", () => {
  it("unionIdentities sem duplicar", () => {
    expect(
      unionIdentities(
        [{ platform: "telegram", externalId: "t" }],
        [
          { platform: "telegram", externalId: "t" },
          { platform: "web", externalId: "w" },
        ],
      ),
    ).toEqual([
      { platform: "telegram", externalId: "t" },
      { platform: "web", externalId: "w" },
    ]);
  });

  it("mergeCategories e mergeBudgets (canônico vence)", () => {
    expect(mergeCategories(["A"], ["a", "B"])).toEqual(["A", "B"]);
    expect(
      mergeBudgets(
        [{ category: "X", limit: 5 }],
        [
          { category: "x", limit: 99 },
          { category: "Y", limit: 7 },
        ],
      ),
    ).toEqual([
      { category: "X", limit: 5 },
      { category: "Y", limit: 7 },
    ]);
  });
});
