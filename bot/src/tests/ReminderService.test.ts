/* eslint-disable @typescript-eslint/no-explicit-any */
import "reflect-metadata";
import sinon from "sinon";
import { ReminderService, nextOccurrence } from "../services/ReminderService";
import { ReminderRepository } from "../repositories/ReminderRepository";

const TG = "telegram" as const;

describe("nextOccurrence", () => {
  it("usa o dia neste mês quando ainda está no futuro", () => {
    const from = new Date(2026, 5, 1, 12, 0, 0); // 01/06/2026 12:00
    const next = nextOccurrence(10, from);
    expect(next.getMonth()).toBe(5); // junho
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(9);
  });

  it("avança para o próximo mês quando o dia já passou", () => {
    const from = new Date(2026, 5, 15, 12, 0, 0); // 15/06/2026
    const next = nextOccurrence(10, from);
    expect(next.getMonth()).toBe(6); // julho
    expect(next.getDate()).toBe(10);
  });
});

describe("ReminderService", () => {
  let repo: sinon.SinonStubbedInstance<ReminderRepository>;
  let service: ReminderService;

  beforeEach(() => {
    repo = sinon.createStubInstance(ReminderRepository);
    service = new ReminderService(repo);
  });

  it("cria o lembrete com o próximo disparo calculado", async () => {
    repo.create.resolves({} as any);
    const from = new Date(2026, 5, 1, 12, 0, 0);

    await service.add(TG, "1", 10, "Conta de luz", "pt", from);

    const arg = repo.create.firstCall.args[0];
    expect(arg.description).toBe("Conta de luz");
    expect(arg.dayOfMonth).toBe(10);
    expect(arg.nextRun.getTime()).toBe(nextOccurrence(10, from).getTime());
  });

  it("remove o n-ésimo lembrete (1-based)", async () => {
    repo.findByUser.resolves([
      { _id: "r1", description: "a" } as any,
      { _id: "r2", description: "b" } as any,
    ]);
    repo.deleteOwned.resolves({ description: "b" } as any);

    const removed = await service.removeNth(TG, "1", "2");

    expect(repo.deleteOwned.calledWith("r2", TG, "1")).toBe(true);
    expect(removed?.description).toBe("b");
  });

  it("retorna null para índice inválido", async () => {
    repo.findByUser.resolves([{ _id: "r1" } as any]);
    expect(await service.removeNth(TG, "1", "5")).toBeNull();
    expect(await service.removeNth(TG, "1", "x")).toBeNull();
  });
});
