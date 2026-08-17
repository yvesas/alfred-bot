import { ModuleDefinition } from "../ModuleDefinition";

// Declarado, não construído. `implemented: false` faz `/tarefas` responder "ainda não
// disponível" em vez de cair no vazio.
//
// Ponto de partida quando for construir: `/lembretes` do módulo fin já é uma tarefa com
// data e entrega por push (`OutboundRegistry`). O que falta é o que o Caddy faz e o
// Alfred não: ser proativo — olhar o que está pendente e avisar sem ser perguntado.
export const tasksModule: ModuleDefinition = {
  id: "tasks",
  title: "Tarefas",
  description:
    "Coisas para fazer: anotar uma tarefa, marcar prazo, listar o que está pendente, " +
    "concluir, e ser lembrado do que vence hoje sem precisar perguntar.",
  implemented: false,
  commands: [{ name: "tarefas", summary: "o que você tem para fazer" }],
};
