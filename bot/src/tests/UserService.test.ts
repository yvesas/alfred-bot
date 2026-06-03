import "reflect-metadata";
import { UserService } from "../services/UserService";
import { UserRepository } from "../repositories/UserRepository";
import { IUser } from "../models/User";
import sinon from "sinon";

const TG = "telegram" as const;

function fakeUser(partial: Partial<IUser>): IUser {
  return {
    identities: [{ platform: "telegram", externalId: "123" }],
    telegramId: "123",
    status: "awaiting_name",
    ...partial,
  } as IUser;
}

describe("UserService (onboarding)", () => {
  let userRepoMock: sinon.SinonStubbedInstance<UserRepository>;
  let userService: UserService;

  beforeEach(() => {
    userRepoMock = sinon.createStubInstance(UserRepository);
    userService = new UserService(userRepoMock);
  });

  it("creates a new user awaiting name and asks for the name", async () => {
    userRepoMock.findByIdentity.resolves(null);
    userRepoMock.create.resolves(fakeUser({ status: "awaiting_name" }));

    const { user, question } = await userService.ensureUser(TG, "123");

    expect(user.status).toBe("awaiting_name");
    expect(question.toLowerCase()).toContain("chama");
    expect(userRepoMock.create.calledOnce).toBe(true);
  });

  it("auto-fills the name from the profile and skips to email", async () => {
    userRepoMock.findByIdentity.resolves(null);
    userRepoMock.create.resolves(fakeUser({ name: "Yves Silva", status: "awaiting_email" }));

    const { user } = await userService.ensureUser(TG, "123", {
      firstName: "Yves",
      lastName: "Silva",
    });

    expect(user.status).toBe("awaiting_email");
    expect(
      userRepoMock.create.calledWith({
        identities: [{ platform: "telegram", externalId: "123" }],
        telegramId: "123",
        name: "Yves Silva",
        status: "awaiting_email",
      }),
    ).toBe(true);
  });

  it("saves a shared phone number", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_email", name: "Yves" }));

    const { reply } = await userService.saveContact(TG, "123", "+5511999999999");

    expect(reply.toLowerCase()).toContain("telefone");
    expect(userRepoMock.updateByIdentity.calledWith(TG, "123", { phone: "+5511999999999" })).toBe(
      true,
    );
  });

  it("stores the name and moves to awaiting_email", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_name" }));

    const { completed, reply } = await userService.submitAnswer(TG, "123", "Yves");

    expect(completed).toBe(false);
    expect(reply).toContain("Yves");
    expect(
      userRepoMock.updateByIdentity.calledWith(TG, "123", {
        name: "Yves",
        status: "awaiting_email",
      }),
    ).toBe(true);
  });

  it("rejects a too-short name without advancing", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_name" }));

    const { completed } = await userService.submitAnswer(TG, "123", "Y");

    expect(completed).toBe(false);
    expect(userRepoMock.updateByIdentity.called).toBe(false);
  });

  it("completes registration with a valid email", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_email", name: "Yves" }));

    const { completed } = await userService.submitAnswer(TG, "123", "yves@example.com");

    expect(completed).toBe(true);
    expect(
      userRepoMock.updateByIdentity.calledWith(TG, "123", {
        email: "yves@example.com",
        status: "complete",
      }),
    ).toBe(true);
  });

  it("re-asks when the email is invalid", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_email", name: "Yves" }));

    const { completed, reply } = await userService.submitAnswer(TG, "123", "not-an-email");

    expect(completed).toBe(false);
    expect(reply.toLowerCase()).toContain("válido");
    expect(userRepoMock.updateByIdentity.called).toBe(false);
  });

  it("completes registration when the user skips the email", async () => {
    userRepoMock.findByIdentity.resolves(fakeUser({ status: "awaiting_email", name: "Yves" }));

    const { completed } = await userService.submitAnswer(TG, "123", "/pular");

    expect(completed).toBe(true);
    expect(userRepoMock.updateByIdentity.calledWith(TG, "123", { status: "complete" })).toBe(true);
  });
});
