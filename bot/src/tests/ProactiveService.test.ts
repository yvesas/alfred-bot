import "reflect-metadata";
import sinon from "sinon";
import {
  ProactiveService,
  withinActiveHours,
  startOfDay,
} from "../core/proactive/ProactiveService";
import { ProactiveLogRepository } from "../repositories/ProactiveLogRepository";
import { UserRepository } from "../repositories/UserRepository";
import { OutboundRegistry } from "../core/OutboundRegistry";
import { TaskService } from "../modules/tasks/TaskService";
import { UserService } from "../services/UserService";
import { PurchaseService } from "../services/PurchaseService";
import { ITask } from "../models/Task";
import { IUser } from "../models/User";
import { config } from "../infra/config";

// Fase 2 — proatividade.
//
// O que estes testes protegem não é "o Alfred consegue falar". É o contrário: que ele
// **cala** quando deve. Assistente que fala demais é desinstalado, e cada supressão
// aqui é uma razão concreta para não incomodar.
describe("ProactiveService", () => {
  let service: ProactiveService;
  let logRepo: sinon.SinonStubbedInstance<ProactiveLogRepository>;
  let userRepo: sinon.SinonStubbedInstance<UserRepository>;
  let outbound: sinon.SinonStubbedInstance<OutboundRegistry>;
  let taskService: sinon.SinonStubbedInstance<TaskService>;
  let purchaseService: sinon.SinonStubbedInstance<PurchaseService>;

  // 10h de um dia qualquer — dentro da janela ativa.
  const HORARIO_BOM = new Date(2026, 8, 10, 10, 0, 0);

  const user = (over: Partial<IUser> = {}): IUser =>
    ({
      _id: "u1",
      language: "pt",
      status: "complete",
      identities: [{ platform: "telegram", externalId: "123" }],
      budgets: [],
      ...over,
    }) as unknown as IUser;

  const task = (description: string, dueDate?: Date): ITask =>
    ({ _id: "t1", description, done: false, dueDate }) as unknown as ITask;

  beforeEach(() => {
    logRepo = sinon.createStubInstance(ProactiveLogRepository);
    userRepo = sinon.createStubInstance(UserRepository);
    outbound = sinon.createStubInstance(OutboundRegistry);
    taskService = sinon.createStubInstance(TaskService);
    purchaseService = sinon.createStubInstance(PurchaseService);

    // Por padrão: nada pendente, nada enviado hoje, entrega funciona.
    logRepo.countSince.resolves(0);
    logRepo.claim.resolves(true);
    outbound.send.resolves(true);
    taskService.dueBy.resolves([]);

    service = new ProactiveService(
      userRepo,
      logRepo,
      outbound,
      taskService,
      sinon.createStubInstance(UserService),
      purchaseService,
    );
  });

  afterEach(() => sinon.restore());

  describe("quando cala — que é o caso comum", () => {
    it("nada a dizer: sai calado", async () => {
      const decision = await service.runFor(user(), HORARIO_BOM);

      expect(decision).toEqual({ sent: false, reason: "nothing-to-say" });
      expect(outbound.send.called).toBe(false);
    });

    it("fora do horário: nem consulta o banco", async () => {
      const madrugada = new Date(2026, 8, 10, 3, 0, 0);

      const decision = await service.runFor(user(), madrugada);

      expect(decision.reason).toBe("quiet-hours");
      expect(taskService.dueBy.called).toBe(false);
    });

    it("teto diário atingido: cala mesmo tendo o que dizer", async () => {
      logRepo.countSince.resolves(config.proactiveDailyCap);
      taskService.dueBy.resolves([task("Renovar seguro", new Date(2026, 8, 9))]);

      const decision = await service.runFor(user(), HORARIO_BOM);

      expect(decision.reason).toBe("daily-cap");
      expect(outbound.send.called).toBe(false);
    });

    it("sem canal para alcançar: nem tenta", async () => {
      const decision = await service.runFor(user({ identities: [] }), HORARIO_BOM);

      expect(decision.reason).toBe("no-channel");
      expect(taskService.dueBy.called).toBe(false);
    });

    // A garantia contra repetir: `claim` é atômico. Se outra réplica pegou o aviso,
    // esta não manda de novo.
    it("aviso já dado: não repete", async () => {
      taskService.dueBy.resolves([task("Renovar seguro", new Date(2026, 8, 9))]);
      logRepo.claim.resolves(false);

      const decision = await service.runFor(user(), HORARIO_BOM);

      expect(decision.reason).toBe("already-said");
      expect(outbound.send.called).toBe(false);
    });
  });

  describe("quando fala", () => {
    it("avisa da tarefa vencida", async () => {
      taskService.dueBy.resolves([task("Renovar seguro", new Date(2026, 8, 9))]);

      const decision = await service.runFor(user(), HORARIO_BOM);

      expect(decision.sent).toBe(true);
      const [platform, externalId, text] = outbound.send.firstCall.args;
      expect(platform).toBe("telegram");
      expect(externalId).toBe("123");
      expect(text).toContain("Renovar seguro");
    });

    // Três avisos de uma vez é o caminho mais curto para ser silenciado.
    it("manda UM aviso por ciclo, mesmo com várias tarefas", async () => {
      taskService.dueBy.resolves([
        task("a", new Date(2026, 8, 9)),
        task("b", new Date(2026, 8, 9)),
        task("c", new Date(2026, 8, 9)),
      ]);

      await service.runFor(user(), HORARIO_BOM);

      expect(outbound.send.callCount).toBe(1);
      expect(outbound.send.firstCall.args[2]).toContain("3");
    });

    it("fala no idioma do usuário", async () => {
      taskService.dueBy.resolves([task("Renew insurance", new Date(2026, 8, 9))]);

      await service.runFor(user({ language: "en" }), HORARIO_BOM);

      expect(outbound.send.firstCall.args[2]).toContain("Past due");
    });

    // Vencida pesa mais que orçamento: uma já falhou, o outro ainda dá tempo.
    it("escolhe o de maior prioridade quando há concorrência", async () => {
      taskService.dueBy.resolves([task("Renovar seguro", new Date(2026, 8, 9))]);
      purchaseService.getSpendingReport.resolves({
        period: "current_month",
        total: 900,
        count: 3,
        byCategory: { Alimentação: 900 },
        byStore: {},
      });

      await service.runFor(
        user({ budgets: [{ category: "Alimentação", limit: 500 }] }),
        HORARIO_BOM,
      );

      expect(outbound.send.callCount).toBe(1);
      expect(outbound.send.firstCall.args[2]).toContain("Renovar seguro");
    });

    // Não entregue não conta como incômodo — a pessoa não recebeu nada.
    it("registra a não-entrega sem contar no teto", async () => {
      taskService.dueBy.resolves([task("Renovar seguro", new Date(2026, 8, 9))]);
      outbound.send.resolves(false);

      const decision = await service.runFor(user(), HORARIO_BOM);

      expect(decision.sent).toBe(false);
      expect(logRepo.markDelivered.calledWith("u1", sinon.match.string, false)).toBe(true);
    });
  });

  // Uma consulta que falha não pode calar o assistente inteiro.
  it("regra que estoura não derruba as outras", async () => {
    taskService.dueBy.rejects(new Error("mongo caiu"));
    purchaseService.getSpendingReport.resolves({
      period: "current_month",
      total: 900,
      count: 3,
      byCategory: { Alimentação: 900 },
      byStore: {},
    });

    const decision = await service.runFor(
      user({ budgets: [{ category: "Alimentação", limit: 500 }] }),
      HORARIO_BOM,
    );

    expect(decision.sent).toBe(true);
    expect(outbound.send.firstCall.args[2]).toContain("Alimentação");
  });

  it("mede a resposta do usuário dentro da janela", async () => {
    await service.noteUserReplied("u1", HORARIO_BOM);

    expect(logRepo.markResponded.calledOnce).toBe(true);
    const [userId, since] = logRepo.markResponded.firstCall.args;
    expect(userId).toBe("u1");
    expect(HORARIO_BOM.getTime() - since.getTime()).toBe(config.proactiveResponseWindowMs);
  });
});

describe("withinActiveHours", () => {
  const at = (hour: number) => new Date(2026, 8, 10, hour, 0, 0);

  it("dentro da janela", () => {
    expect(withinActiveHours(at(9), 9, 21)).toBe(true);
    expect(withinActiveHours(at(14), 9, 21)).toBe(true);
    expect(withinActiveHours(at(20), 9, 21)).toBe(true);
  });

  it("fora da janela", () => {
    expect(withinActiveHours(at(3), 9, 21)).toBe(false);
    expect(withinActiveHours(at(8), 9, 21)).toBe(false);
    // 21 é o fim exclusivo: às 21h já não fala.
    expect(withinActiveHours(at(21), 9, 21)).toBe(false);
    expect(withinActiveHours(at(23), 9, 21)).toBe(false);
  });
});

describe("startOfDay", () => {
  it("leva para a meia-noite do mesmo dia", () => {
    const start = startOfDay(new Date(2026, 8, 10, 15, 30));

    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(10);
  });
});
