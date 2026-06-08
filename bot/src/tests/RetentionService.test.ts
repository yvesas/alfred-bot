/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { RetentionService } from "../services/RetentionService";
import { UserRepository } from "../repositories/UserRepository";
import { AccountService } from "../services/AccountService";

describe("RetentionService", () => {
  it("purga as sessões anônimas inativas e retorna o total", async () => {
    const userRepo = sinon.createStubInstance(UserRepository);
    const accounts = sinon.createStubInstance(AccountService);
    userRepo.findAnonymousInactive.resolves([{ _id: "a" } as any, { _id: "b" } as any]);
    accounts.deleteAccount.resolves({ purchases: 0, reminders: 0 });

    const n = await new RetentionService(userRepo, accounts).purgeAnonymous();

    expect(n).toBe(2);
    expect(accounts.deleteAccount.callCount).toBe(2);
  });

  it("não faz nada quando não há sessões a purgar", async () => {
    const userRepo = sinon.createStubInstance(UserRepository);
    const accounts = sinon.createStubInstance(AccountService);
    userRepo.findAnonymousInactive.resolves([]);

    expect(await new RetentionService(userRepo, accounts).purgeAnonymous()).toBe(0);
    expect(accounts.deleteAccount.called).toBe(false);
  });
});
