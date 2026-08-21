import "reflect-metadata";
import { TaskService, parseDueDate, endOfDay } from "../modules/tasks/TaskService";
import { TaskRepository } from "../repositories/TaskRepository";
import { connectMemoryMongo, disconnectMemoryMongo, clearCollections } from "./helpers/memoryMongo";

// Fase 1 do roadmap. Contra Mongo de verdade porque o que importa aqui é a ORDEM da
// listagem e o escopo por usuário — as duas coisas são da query, não do código.
describe("TaskService", () => {
  let service: TaskService;
  const ANA = "user_ana";
  const BRUNO = "user_bruno";

  beforeAll(connectMemoryMongo);
  afterAll(disconnectMemoryMongo);
  beforeEach(async () => {
    await clearCollections();
    service = new TaskService(new TaskRepository());
  });

  const d = (iso: string) => new Date(iso);

  it("anota uma tarefa sem prazo", async () => {
    const task = await service.add(ANA, "Comprar café");

    expect(task.description).toBe("Comprar café");
    expect(task.dueDate).toBeUndefined();
    expect(task.done).toBe(false);
  });

  it("anota com prazo", async () => {
    const task = await service.add(ANA, "Renovar seguro", d("2026-09-10T23:59:59Z"));

    expect(task.dueDate).toEqual(d("2026-09-10T23:59:59Z"));
  });

  // A ordem é o produto da listagem: o que vence antes aparece antes, e o que não
  // vence nunca vai para o fim — existe, mas não é urgente.
  it("lista as pendentes por prazo, com as sem prazo no fim", async () => {
    await service.add(ANA, "sem prazo");
    await service.add(ANA, "vence depois", d("2026-12-01T00:00:00Z"));
    await service.add(ANA, "vence antes", d("2026-09-01T00:00:00Z"));

    const list = await service.listPending(ANA);

    expect(list.map((t) => t.description)).toEqual(["vence antes", "vence depois", "sem prazo"]);
  });

  it("não mistura tarefa de outro usuário", async () => {
    await service.add(ANA, "da Ana");
    await service.add(BRUNO, "do Bruno");

    const list = await service.listPending(ANA);

    expect(list).toHaveLength(1);
    expect(list[0].description).toBe("da Ana");
  });

  it("conclui pelo número que a pessoa vê", async () => {
    await service.add(ANA, "primeira", d("2026-09-01T00:00:00Z"));
    await service.add(ANA, "segunda", d("2026-10-01T00:00:00Z"));

    const done = await service.completeNth(ANA, 2);

    expect(done?.description).toBe("segunda");
    expect(done?.done).toBe(true);
    expect(done?.doneAt).toBeInstanceOf(Date);
  });

  it("concluída sai da listagem", async () => {
    await service.add(ANA, "única");
    await service.completeNth(ANA, 1);

    expect(await service.listPending(ANA)).toHaveLength(0);
    expect(await service.countPending(ANA)).toBe(0);
  });

  it("a numeração se refecha depois de concluir", async () => {
    await service.add(ANA, "a", d("2026-09-01T00:00:00Z"));
    await service.add(ANA, "b", d("2026-10-01T00:00:00Z"));
    await service.completeNth(ANA, 1);

    // "b" era a 2; com "a" fora, passa a ser a 1.
    const done = await service.completeNth(ANA, 1);
    expect(done?.description).toBe("b");
  });

  it("recusa número que não corresponde a nada", async () => {
    await service.add(ANA, "única");

    expect(await service.completeNth(ANA, 0)).toBeNull();
    expect(await service.completeNth(ANA, 2)).toBeNull();
    expect(await service.completeNth(ANA, -1)).toBeNull();
    expect(await service.completeNth(ANA, 1.5)).toBeNull();
  });

  it("não conclui a tarefa de outro usuário", async () => {
    await service.add(BRUNO, "do Bruno");

    expect(await service.completeNth(ANA, 1)).toBeNull();
  });

  it("remove pelo número", async () => {
    await service.add(ANA, "para remover");

    const removed = await service.removeNth(ANA, 1);

    expect(removed?.description).toBe("para remover");
    expect(await service.countPending(ANA)).toBe(0);
  });

  // A consulta que a proatividade (Fase 2) vai usar.
  describe("dueBy", () => {
    it("traz o que vence até o fim do dia, e o que já venceu", async () => {
      const hoje = d("2026-09-10T12:00:00");
      await service.add(ANA, "venceu ontem", d("2026-09-09T23:59:59"));
      await service.add(ANA, "vence hoje", d("2026-09-10T23:59:59"));
      await service.add(ANA, "vence amanhã", d("2026-09-11T23:59:59"));
      await service.add(ANA, "sem prazo");

      const due = await service.dueBy(ANA, hoje);

      expect(due.map((t) => t.description)).toEqual(["venceu ontem", "vence hoje"]);
    });

    it("não traz concluída", async () => {
      await service.add(ANA, "vence hoje", d("2026-09-10T10:00:00"));
      await service.completeNth(ANA, 1);

      expect(await service.dueBy(ANA, d("2026-09-10T12:00:00"))).toHaveLength(0);
    });
  });
});

describe("parseDueDate", () => {
  const hoje = new Date("2026-09-10T12:00:00");

  it("lê DD/MM", () => {
    const due = parseDueDate("15/09", hoje)!;

    expect(due.getDate()).toBe(15);
    expect(due.getMonth()).toBe(8); // setembro
    expect(due.getFullYear()).toBe(2026);
  });

  it("aceita um dígito no dia e no mês", () => {
    expect(parseDueDate("5/9", hoje)?.getDate()).toBe(5);
  });

  // Quem escreve "01/02" em dezembro quer fevereiro que vem, não o que passou.
  it("data já passada neste ano vira a do ano seguinte", () => {
    expect(parseDueDate("01/02", hoje)?.getFullYear()).toBe(2027);
  });

  it("vence no fim do dia, não no começo", () => {
    const due = parseDueDate("15/09", hoje)!;

    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });

  it("recusa o que não é DD/MM", () => {
    for (const bad of ["", "amanhã", "15", "15/09/2026", "15-09", "abc/def", "15/9x"]) {
      expect(parseDueDate(bad, hoje)).toBeNull();
    }
  });

  // Sem isto o Date normalizaria 31/02 para 03/03, e a pessoa receberia um prazo
  // que ela não escreveu.
  it("recusa data que não existe", () => {
    expect(parseDueDate("31/02", hoje)).toBeNull();
    expect(parseDueDate("31/04", hoje)).toBeNull();
    expect(parseDueDate("00/09", hoje)).toBeNull();
    expect(parseDueDate("15/13", hoje)).toBeNull();
  });

  it("aceita 29/02 em ano bissexto", () => {
    // 2028 é bissexto; a partir de 2026 a próxima ocorrência válida cai lá.
    expect(parseDueDate("29/02", new Date("2028-01-01T12:00:00"))?.getDate()).toBe(29);
  });
});

describe("endOfDay", () => {
  it("leva para o último instante do dia", () => {
    const end = endOfDay(new Date("2026-09-10T03:00:00"));

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(10);
  });
});
