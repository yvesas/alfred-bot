import "reflect-metadata";
import { ReminderRepository } from "../repositories/ReminderRepository";
import { IReminderCreate } from "../models/Reminder";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

const TG = "telegram" as const;

function reminder(over: Partial<IReminderCreate>): IReminderCreate {
  return {
    platform: TG,
    externalId: "1",
    description: "Conta de luz",
    dayOfMonth: 10,
    nextRun: new Date(2026, 5, 10),
    active: true,
    language: "pt",
    ...over,
  };
}

describe("ReminderRepository (mongo em memória)", () => {
  const repo = new ReminderRepository();

  beforeAll(async () => {
    await connectMemoryMongo();
  }, 120000);
  afterAll(async () => {
    await disconnectMemoryMongo();
  });
  beforeEach(async () => {
    await clearCollections();
  });

  it("cria e lista por usuário (ordenado por dia)", async () => {
    await repo.create(reminder({ dayOfMonth: 20, description: "b" }));
    await repo.create(reminder({ dayOfMonth: 5, description: "a" }));
    const list = await repo.findByUser(TG, "1");
    expect(list.map((r) => r.description)).toEqual(["a", "b"]);
  });

  it("findDue retorna apenas ativos e vencidos", async () => {
    await repo.create(reminder({ nextRun: new Date(2026, 0, 1) })); // vencido
    await repo.create(reminder({ nextRun: new Date(2030, 0, 1) })); // futuro
    await repo.create(reminder({ nextRun: new Date(2026, 0, 1), active: false })); // inativo

    const due = await repo.findDue(new Date(2026, 5, 1));
    expect(due).toHaveLength(1);
  });

  it("deleteOwned só remove do dono", async () => {
    const r = await repo.create(reminder({ externalId: "1" }));
    const id = String(r._id);
    expect(await repo.deleteOwned(id, TG, "outro")).toBeNull();
    expect(await repo.deleteOwned(id, TG, "1")).not.toBeNull();
  });

  it("setNextRun reprograma", async () => {
    const r = await repo.create(reminder({}));
    const next = new Date(2026, 6, 10);
    const updated = await repo.setNextRun(String(r._id), next, new Date(2026, 5, 10));
    expect(updated?.nextRun.getTime()).toBe(next.getTime());
  });

  it("reassignExternalId e deleteByIdentities", async () => {
    await repo.create(reminder({ externalId: "old" }));
    await repo.create(reminder({ externalId: "old" }));

    expect(await repo.reassignExternalId(TG, "old", "new")).toBe(2);
    expect(await repo.findByUser(TG, "new")).toHaveLength(2);

    const removed = await repo.deleteByIdentities([{ platform: TG, externalId: "new" }]);
    expect(removed).toBe(2);
  });
});
