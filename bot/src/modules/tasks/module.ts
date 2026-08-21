import { ModuleDefinition } from "../ModuleDefinition";

// Construído na Fase 1 do roadmap. Chaveado pelo `User._id` canônico, não pelo canal:
// a pessoa anota no Telegram e conclui no web.
//
// O que ainda não existe é a metade que importa — **ser proativo**. Hoje o Alfred só
// diz o que vence se perguntarem. `dueDate` e `TaskRepository.findDue` existem já
// pensando nisso; é a Fase 2.
export const tasksModule: ModuleDefinition = {
  id: "tasks",
  title: "Tarefas",
  description:
    "Coisas para fazer: anotar uma tarefa, marcar prazo, listar o que está pendente, " +
    "concluir, e ser lembrado do que vence hoje sem precisar perguntar.",
  implemented: true,
  commands: [{ name: "tarefas", summary: "o que você tem para fazer" }],
};
