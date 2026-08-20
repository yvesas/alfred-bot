import "reflect-metadata";
import sinon from "sinon";
import { ReminderScheduler } from "../services/ReminderScheduler";
import { RetentionScheduler } from "../services/RetentionScheduler";
import { ReminderService } from "../services/ReminderService";
import { RetentionService } from "../services/RetentionService";
import { JobLockService } from "../services/JobLockService";
import { OutboundRegistry } from "../core/OutboundRegistry";

// Os dois schedulers não tinham teste nenhum — descoberto ao pôr o lock (C3). Estes
// casos cobrem o que o lock mudou: o ciclo só roda para quem ganhou a disputa.
describe("schedulers sob lock (C3)", () => {
  let locks: sinon.SinonStubbedInstance<JobLockService>;

  // Imita o JobLockService: roda o ciclo quando ganha, não roda quando perde.
  const lockGranted = () =>
    locks.runExclusively.callsFake(async (_job, _ttl, run) => {
      await run();
      return true;
    });
  const lockDenied = () => locks.runExclusively.resolves(false);

  beforeEach(() => {
    locks = sinon.createStubInstance(JobLockService);
  });

  afterEach(() => sinon.restore());

  describe("ReminderScheduler", () => {
    let reminders: sinon.SinonStubbedInstance<ReminderService>;
    let outbound: sinon.SinonStubbedInstance<OutboundRegistry>;
    let scheduler: ReminderScheduler;

    beforeEach(() => {
      reminders = sinon.createStubInstance(ReminderService);
      outbound = sinon.createStubInstance(OutboundRegistry);
      outbound.send.resolves(true);
      scheduler = new ReminderScheduler(reminders, outbound, locks);
    });

    const due = () => [
      {
        platform: "telegram",
        externalId: "1",
        description: "Conta de luz",
        dayOfMonth: 10,
        language: "pt",
      },
    ];

    it("entrega os lembretes vencidos quando ganha o lock", async () => {
      lockGranted();
      reminders.findDue.resolves(due() as never);

      await scheduler.tick(new Date());

      expect(outbound.send.calledOnce).toBe(true);
      expect(reminders.markNotified.calledOnce).toBe(true);
    });

    // O ponto do C3: com N réplicas, só uma entrega. As outras não tocam no banco.
    it("não entrega nada quando outra instância está com o lock", async () => {
      lockDenied();

      await scheduler.tick(new Date());

      expect(reminders.findDue.called).toBe(false);
      expect(outbound.send.called).toBe(false);
    });

    // Comportamento que já existia e precisa continuar: usuário offline não trava a
    // série mensal — o lembrete é reprogramado do mesmo jeito.
    it("reprograma mesmo quando a entrega falha", async () => {
      lockGranted();
      reminders.findDue.resolves(due() as never);
      outbound.send.resolves(false);

      await scheduler.tick(new Date());

      expect(reminders.markNotified.calledOnce).toBe(true);
    });

    it("um ciclo que estoura não derruba o processo", async () => {
      lockGranted();
      reminders.findDue.rejects(new Error("mongo caiu"));

      await expect(scheduler.tick(new Date())).resolves.toBeUndefined();
    });
  });

  describe("RetentionScheduler", () => {
    let retention: sinon.SinonStubbedInstance<RetentionService>;
    let scheduler: RetentionScheduler;

    beforeEach(() => {
      retention = sinon.createStubInstance(RetentionService);
      retention.purgeAnonymous.resolves(0);
      scheduler = new RetentionScheduler(retention, locks);
    });

    it("purga quando ganha o lock", async () => {
      lockGranted();

      await scheduler.tick(new Date());

      expect(retention.purgeAnonymous.calledOnce).toBe(true);
    });

    // Este job APAGA CONTAS. Duas instâncias purgando concorrentemente é o pior caso
    // de todo o C3 — por isso o teste é explícito.
    it("NÃO purga quando outra instância está com o lock", async () => {
      lockDenied();

      await scheduler.tick(new Date());

      expect(retention.purgeAnonymous.called).toBe(false);
    });

    it("um ciclo que estoura não derruba o processo", async () => {
      lockGranted();
      retention.purgeAnonymous.rejects(new Error("mongo caiu"));

      await expect(scheduler.tick(new Date())).resolves.toBeUndefined();
    });
  });
});
