import "reflect-metadata";
import sinon from "sinon";
import { findCommand } from "../core/commandRegistry";
import { RegisteredCommandContext } from "../core/CommandContext";
import { TaskService } from "../modules/tasks/TaskService";
import { formatTask, formatDue } from "../modules/tasks/commands";
import { ITask } from "../models/Task";
import { Language } from "../models/User";

// O handler de `/tarefas`, exercitado pelo registro — o mesmo caminho que o BotCore
// usa. O `TaskService` é stub: o comportamento dele já é provado contra Mongo real em
// `TaskService.test.ts`; aqui o que importa é o roteamento de subcomando e a resposta.
describe("/tarefas", () => {
  let taskService: sinon.SinonStubbedInstance<TaskService>;
  let replies: string[];

  const task = (over: Partial<ITask> = {}): ITask =>
    ({ _id: "t1", description: "Comprar café", done: false, ...over }) as ITask;

  const run = async (args: string[], lang: Language = "pt") => {
    const command = findCommand("tarefas");
    if (!command?.requiresRegistration) throw new Error("esperava comando com cadastro");

    await command.handle({
      reply: { text: async (m: string) => void replies.push(m) },
      lang,
      userId: "u1",
      args,
      deps: { taskService },
    } as unknown as RegisteredCommandContext);
  };

  beforeEach(() => {
    replies = [];
    taskService = sinon.createStubInstance(TaskService);
    taskService.listPending.resolves([]);
  });

  afterEach(() => sinon.restore());

  describe("add", () => {
    it("anota sem prazo", async () => {
      taskService.add.resolves(task());

      await run(["add", "Comprar", "café"]);

      expect(taskService.add.calledWith("u1", "Comprar café", undefined)).toBe(true);
      expect(replies[0]).toContain("Comprar café");
    });

    it("lê o prazo quando o primeiro token é DD/MM", async () => {
      const due = new Date(2099, 8, 10, 23, 59, 59, 999);
      taskService.add.resolves(task({ description: "Renovar seguro", dueDate: due }));

      await run(["add", "10/09", "Renovar", "seguro"]);

      const [, description, dueArg] = taskService.add.firstCall.args;
      expect(description).toBe("Renovar seguro");
      expect(dueArg).toBeInstanceOf(Date);
      expect(replies[0]).toContain("10/09");
    });

    // Se o primeiro token não é uma data, ele é parte da descrição — não some.
    it("não engole o primeiro token quando ele não é data", async () => {
      taskService.add.resolves(task({ description: "Ligar para a Ana" }));

      await run(["add", "Ligar", "para", "a", "Ana"]);

      expect(taskService.add.firstCall.args[1]).toBe("Ligar para a Ana");
    });

    it("aceita `adicionar` como sinônimo", async () => {
      taskService.add.resolves(task());

      await run(["adicionar", "Comprar café"]);

      expect(taskService.add.called).toBe(true);
    });

    it("pede o uso quando não vem descrição", async () => {
      await run(["add"]);

      expect(taskService.add.called).toBe(false);
      expect(replies[0]).toContain("/tarefas add");
    });

    // Sem descrição, só a data, não vira tarefa vazia.
    it("pede o uso quando só vem a data", async () => {
      await run(["add", "10/09"]);

      expect(taskService.add.called).toBe(false);
    });
  });

  describe("concluir", () => {
    it("conclui pelo número", async () => {
      taskService.completeNth.resolves(task({ description: "Comprar café" }));

      await run(["ok", "2"]);

      expect(taskService.completeNth.calledWith("u1", 2)).toBe(true);
      expect(replies[0]).toContain("Comprar café");
    });

    it.each(["ok", "concluir", "done"])("aceita `%s`", async (sub) => {
      taskService.completeNth.resolves(task());

      await run([sub, "1"]);

      expect(taskService.completeNth.called).toBe(true);
    });

    it("avisa quando o número não corresponde a nada", async () => {
      taskService.completeNth.resolves(null);

      await run(["ok", "99"]);

      expect(replies[0]).toContain("Número inválido");
    });
  });

  describe("remover", () => {
    it.each(["remover", "remove", "rm", "del"])("aceita `%s`", async (sub) => {
      taskService.removeNth.resolves(task());

      await run([sub, "1"]);

      expect(taskService.removeNth.called).toBe(true);
    });

    it("avisa quando o número não corresponde a nada", async () => {
      taskService.removeNth.resolves(null);

      await run(["remover", "99"]);

      expect(replies[0]).toContain("Número inválido");
    });
  });

  describe("listar", () => {
    it("diz que não há nada pendente", async () => {
      await run([]);

      expect(replies[0]).toContain("Nada pendente");
    });

    it("numera a partir de 1", async () => {
      taskService.listPending.resolves([task({ description: "a" }), task({ description: "b" })]);

      await run([]);

      expect(replies[0]).toContain("1. a");
      expect(replies[0]).toContain("2. b");
    });

    it("subcomando desconhecido cai na listagem", async () => {
      await run(["blablabla"]);

      expect(taskService.listPending.calledOnce).toBe(true);
    });

    it("lista no idioma do usuário", async () => {
      await run([], "en");

      expect(replies[0]).toContain("Nothing pending");
    });
  });
});

describe("formatação de tarefa", () => {
  const hoje = new Date(2026, 8, 10, 12, 0, 0);
  const task = (dueDate?: Date): ITask =>
    ({ description: "Renovar seguro", done: false, dueDate }) as ITask;

  it("sem prazo, só o número e a descrição", () => {
    expect(formatTask(task(), 1, "pt", hoje)).toBe("1. Renovar seguro");
  });

  it("com prazo futuro, mostra a data", () => {
    const out = formatTask(task(new Date(2026, 8, 20)), 1, "pt", hoje);

    expect(out).toContain("20/09");
    expect(out).not.toContain("⚠️");
  });

  // Numa lista longa, o que já passou tem que saltar sem a pessoa comparar datas.
  it("vencida ganha marcação própria", () => {
    const out = formatTask(task(new Date(2026, 8, 1)), 1, "pt", hoje);

    expect(out).toContain("⚠️");
    expect(out).toContain("venceu");
  });

  it("formata a data com dois dígitos", () => {
    expect(formatDue(new Date(2026, 0, 5))).toBe("05/01");
  });
});
