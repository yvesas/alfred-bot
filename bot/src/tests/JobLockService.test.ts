import "reflect-metadata";
import { JobLockService } from "../services/JobLockService";
import { JobLockModel } from "../models/JobLock";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

// C3 — a garantia aqui é exclusão mútua entre instâncias, e isso é uma propriedade do
// banco, não do código. Um mock provaria só que o método foi chamado. Por isso estes
// testes sobem um MongoDB de verdade: é a única forma de provar que duas instâncias
// disputando a mesma linha resultam em uma vencedora.
describe("JobLockService", () => {
  const JOB = "reminders";
  const MINUTE = 60_000;

  beforeAll(connectMemoryMongo);
  afterAll(disconnectMemoryMongo);
  beforeEach(clearCollections);

  // Cada instância do serviço representa uma réplica diferente do bot.
  const instance = () => new JobLockService();

  it("dá o lock para quem chega primeiro", async () => {
    expect(await instance().acquire(JOB, MINUTE)).toBe(true);
  });

  it("recusa a segunda instância enquanto o lock está em pé", async () => {
    const first = instance();
    const second = instance();

    expect(await first.acquire(JOB, MINUTE)).toBe(true);
    expect(await second.acquire(JOB, MINUTE)).toBe(false);
  });

  // O teste que importa: N réplicas acordam no mesmo milissegundo. O Mongo serializa
  // a disputa pela linha e exatamente uma vence.
  it("com cinco instâncias disputando ao mesmo tempo, exatamente uma vence", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => instance().acquire(JOB, MINUTE)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  // Se a instância que segurava morreu no meio do ciclo, o lock não pode ficar preso
  // para sempre — ele vence sozinho.
  it("libera sozinho quando o TTL vence", async () => {
    const dead = instance();
    const now = new Date();

    expect(await dead.acquire(JOB, MINUTE, now)).toBe(true);

    const later = new Date(now.getTime() + MINUTE + 1);
    expect(await instance().acquire(JOB, MINUTE, later)).toBe(true);
  });

  it("devolve o lock no release, sem esperar o TTL", async () => {
    const first = instance();
    await first.acquire(JOB, MINUTE);
    await first.release(JOB);

    expect(await instance().acquire(JOB, MINUTE)).toBe(true);
  });

  // Liberar o lock de outra instância seria liberar o ciclo dela no meio.
  it("release de quem não é dono não libera nada", async () => {
    const owner = instance();
    const stranger = instance();

    await owner.acquire(JOB, MINUTE);
    await stranger.release(JOB);

    expect(await stranger.acquire(JOB, MINUTE)).toBe(false);
  });

  it("locks de jobs diferentes não se atrapalham", async () => {
    const one = instance();

    expect(await one.acquire("reminders", MINUTE)).toBe(true);
    expect(await one.acquire("retention", MINUTE)).toBe(true);
  });

  describe("runExclusively", () => {
    it("roda o ciclo e devolve o lock no fim", async () => {
      const service = instance();
      const run = jest.fn().mockResolvedValue(undefined);

      expect(await service.runExclusively(JOB, MINUTE, run)).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
      // Devolvido: a próxima instância não espera o TTL.
      expect(await instance().acquire(JOB, MINUTE)).toBe(true);
    });

    it("não roda o ciclo quando outra instância está com o lock", async () => {
      await instance().acquire(JOB, MINUTE);
      const run = jest.fn();

      expect(await instance().runExclusively(JOB, MINUTE, run)).toBe(false);
      expect(run).not.toHaveBeenCalled();
    });

    // Um ciclo que estoura não pode deixar o lock preso até o TTL — o próximo ciclo
    // ficaria de fora sem motivo.
    it("devolve o lock mesmo se o ciclo lançar", async () => {
      const service = instance();
      const boom = new Error("ciclo falhou");

      await expect(service.runExclusively(JOB, MINUTE, () => Promise.reject(boom))).rejects.toThrow(
        boom,
      );

      expect(await instance().acquire(JOB, MINUTE)).toBe(true);
    });
  });

  it("registra o dono, para dar para investigar quem segurou", async () => {
    await instance().acquire(JOB, MINUTE);

    const row = await JobLockModel.findOne({ job: JOB }).exec();
    expect(row?.owner).toBeTruthy();
    expect(row?.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });
});
