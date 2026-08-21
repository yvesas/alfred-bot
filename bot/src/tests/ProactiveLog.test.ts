import "reflect-metadata";
import sinon from "sinon";
import { ProactiveLogRepository } from "../repositories/ProactiveLogRepository";
import { ProactiveScheduler } from "../services/ProactiveScheduler";
import { ProactiveService } from "../core/proactive/ProactiveService";
import { JobLockService } from "../services/JobLockService";
import { IUser } from "../models/User";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

// Contra Mongo real: o que impede repetir um aviso é o índice único em
// `(userId, key)`, não uma leitura anterior — entre ler e escrever cabe outro ciclo.
// Mesma lição do JobLockService, e só o banco prova.
describe("ProactiveLogRepository", () => {
  let repo: ProactiveLogRepository;
  const ANA = "user_ana";
  const AGORA = new Date(2026, 8, 10, 10, 0, 0);

  beforeAll(connectMemoryMongo);
  afterAll(disconnectMemoryMongo);
  beforeEach(async () => {
    await clearCollections();
    repo = new ProactiveLogRepository();
  });

  it("o primeiro a reivindicar o aviso ganha", async () => {
    expect(await repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA)).toBe(true);
  });

  it("o mesmo aviso não é reivindicado duas vezes", async () => {
    await repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA);

    expect(await repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA)).toBe(false);
  });

  // O caso que importa com réplica: dois ciclos acordam juntos e avaliam o mesmo
  // usuário. Só um pode mandar.
  it("com cinco ciclos concorrentes, só um reivindica", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("avisos diferentes não se atrapalham", async () => {
    expect(await repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA)).toBe(true);
    expect(await repo.claim(ANA, "budget:over:2026-09", "budget", AGORA)).toBe(true);
  });

  it("usuários diferentes recebem o mesmo aviso", async () => {
    await repo.claim(ANA, "task-due:hoje", "tasks-due", AGORA);

    expect(await repo.claim("outro", "task-due:hoje", "tasks-due", AGORA)).toBe(true);
  });

  describe("teto diário", () => {
    it("conta só o que foi entregue", async () => {
      await repo.claim(ANA, "a", "tasks-due", AGORA);
      await repo.markDelivered(ANA, "a", true);
      await repo.claim(ANA, "b", "tasks-due", AGORA);
      await repo.markDelivered(ANA, "b", false); // não incomodou ninguém

      expect(await repo.countSince(ANA, new Date(2026, 8, 10))).toBe(1);
    });

    it("não conta o de ontem", async () => {
      await repo.claim(ANA, "ontem", "tasks-due", new Date(2026, 8, 9, 10, 0));
      await repo.markDelivered(ANA, "ontem", true);

      expect(await repo.countSince(ANA, new Date(2026, 8, 10))).toBe(0);
    });
  });

  describe("resposta do usuário", () => {
    it("marca o aviso mais recente dentro da janela", async () => {
      await repo.claim(ANA, "a", "tasks-due", AGORA);
      await repo.markDelivered(ANA, "a", true);

      const janela = new Date(AGORA.getTime() - 30 * 60_000);
      expect(await repo.markResponded(ANA, janela, new Date(AGORA.getTime() + 60_000))).toBe(true);
    });

    it("não marca aviso antigo demais", async () => {
      await repo.claim(ANA, "velho", "tasks-due", new Date(2026, 8, 10, 5, 0));
      await repo.markDelivered(ANA, "velho", true);

      const janela = new Date(AGORA.getTime() - 30 * 60_000);
      expect(await repo.markResponded(ANA, janela, AGORA)).toBe(false);
    });

    it("não marca o que não foi entregue", async () => {
      await repo.claim(ANA, "a", "tasks-due", AGORA);
      await repo.markDelivered(ANA, "a", false);

      const janela = new Date(AGORA.getTime() - 30 * 60_000);
      expect(await repo.markResponded(ANA, janela, AGORA)).toBe(false);
    });
  });

  it("exclusão de conta apaga o histórico (LGPD)", async () => {
    await repo.claim(ANA, "a", "tasks-due", AGORA);

    expect(await repo.deleteByUser(ANA)).toBe(1);
    expect(await repo.claim(ANA, "a", "tasks-due", AGORA)).toBe(true);
  });
});

describe("ProactiveScheduler", () => {
  let scheduler: ProactiveScheduler;
  let proactive: sinon.SinonStubbedInstance<ProactiveService>;
  let locks: sinon.SinonStubbedInstance<JobLockService>;

  const user = (id: string) => ({ _id: id }) as unknown as IUser;

  beforeEach(() => {
    proactive = sinon.createStubInstance(ProactiveService);
    locks = sinon.createStubInstance(JobLockService);
    scheduler = new ProactiveScheduler(proactive, locks);
  });

  afterEach(() => sinon.restore());

  const lockGranted = () =>
    locks.runExclusively.callsFake(async (_job, _ttl, run) => {
      await run();
      return true;
    });

  it("avalia cada usuário elegível quando ganha o lock", async () => {
    lockGranted();
    proactive.eligibleUsers.resolves([user("a"), user("b")]);
    proactive.runFor.resolves({ sent: false, reason: "nothing-to-say" });

    await scheduler.tick(new Date());

    expect(proactive.runFor.callCount).toBe(2);
  });

  // Com N réplicas, N ciclos acordam juntos — a pessoa receberia o mesmo aviso N vezes.
  it("não avalia ninguém quando outra instância está com o lock", async () => {
    locks.runExclusively.resolves(false);

    await scheduler.tick(new Date());

    expect(proactive.eligibleUsers.called).toBe(false);
  });

  // Um usuário que estoura não pode calar o ciclo para os outros.
  it("um usuário com erro não interrompe os demais", async () => {
    lockGranted();
    proactive.eligibleUsers.resolves([user("a"), user("b"), user("c")]);
    proactive.runFor.onFirstCall().rejects(new Error("mongo caiu"));
    proactive.runFor.resolves({ sent: false, reason: "nothing-to-say" });

    await scheduler.tick(new Date());

    expect(proactive.runFor.callCount).toBe(3);
  });

  it("um ciclo que estoura não derruba o processo", async () => {
    lockGranted();
    proactive.eligibleUsers.rejects(new Error("mongo caiu"));

    await expect(scheduler.tick(new Date())).resolves.toBeUndefined();
  });

  it("start é idempotente e stop encerra", () => {
    scheduler.start();
    scheduler.start();
    scheduler.stop();

    expect(() => scheduler.stop()).not.toThrow();
  });
});
