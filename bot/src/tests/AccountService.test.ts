/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { AccountService } from "../services/AccountService";
import { UserRepository } from "../repositories/UserRepository";
import { PurchaseRepository } from "../repositories/PurchaseRepository";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { encodeState, decodeState } from "../infra/authServer";

describe("AccountService", () => {
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;
  let purchaseRepo: sinon.SinonStubbedInstance<PurchaseRepository>;
  let reminderRepo: sinon.SinonStubbedInstance<ReminderRepository>;
  let service: AccountService;

  beforeEach(() => {
    userRepo = sinon.createStubInstance(UserRepository);
    purchaseRepo = sinon.createStubInstance(PurchaseRepository);
    reminderRepo = sinon.createStubInstance(ReminderRepository);
    service = new AccountService(userRepo, purchaseRepo, reminderRepo);
  });

  it("cria o usuário do WorkOS já completo, com o perfil", async () => {
    userRepo.findByIdentity.resolves(null);
    userRepo.create.resolves({} as any);

    await service.ensureWorkosUser("user_1", { name: "Yves", email: "A@B.com" });

    const arg = userRepo.create.firstCall.args[0] as any;
    expect(arg.status).toBe("complete");
    expect(arg.name).toBe("Yves");
    expect(arg.email).toBe("a@b.com"); // normalizado
    expect(arg.identities).toEqual([{ platform: "web", externalId: "user_1" }]);
  });

  it("atualiza um usuário existente para completo", async () => {
    userRepo.findByIdentity.resolves({ _id: "x" } as any);
    userRepo.updateByIdentity.resolves({} as any);

    await service.ensureWorkosUser("user_1", { name: "Yves" });

    expect(
      userRepo.updateByIdentity.calledWith(
        "web",
        "user_1",
        sinon.match({ status: "complete", name: "Yves" }),
      ),
    ).toBe(true);
    expect(userRepo.create.called).toBe(false);
  });

  it("absorve o anônimo: reatribui compras/lembretes, funde e remove o doc anônimo", async () => {
    purchaseRepo.reassignUser.resolves(3);
    reminderRepo.reassignExternalId.resolves(1);
    userRepo.findByIdentity
      .withArgs("web", "anon")
      .resolves({ categories: ["Bar"], budgets: [{ category: "Bar", limit: 50 }] } as any);
    userRepo.findByIdentity
      .withArgs("web", "canon")
      .resolves({ categories: ["Mercado"], budgets: [] } as any);

    await service.absorbAnonymous("canon", "anon");

    expect(purchaseRepo.reassignUser.calledWith("anon", "canon")).toBe(true);
    expect(reminderRepo.reassignExternalId.calledWith("web", "anon", "canon")).toBe(true);
    const patch = userRepo.updateByIdentity.firstCall.args[2] as any;
    expect(patch.categories).toEqual(["Mercado", "Bar"]);
    expect(patch.budgets).toEqual([{ category: "Bar", limit: 50 }]);
    expect(userRepo.deleteByIdentity.calledWith("web", "anon")).toBe(true);
  });

  it("não faz nada quando os ids são iguais", async () => {
    await service.absorbAnonymous("same", "same");
    expect(purchaseRepo.reassignUser.called).toBe(false);
  });
});

describe("auth state (encode/decode)", () => {
  it("roundtrip preserva o clientId anônimo", () => {
    const encoded = encodeState({ anon: "abc-123" });
    expect(decodeState(encoded)).toEqual({ anon: "abc-123" });
  });

  it("decodifica entrada inválida como anon vazio", () => {
    expect(decodeState(null)).toEqual({ anon: "" });
    expect(decodeState("@@@notbase64json")).toEqual({ anon: "" });
  });
});
