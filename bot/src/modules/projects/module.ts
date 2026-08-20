import { ModuleDefinition } from "../ModuleDefinition";

// Declarado, não construído. Ver `modules/tasks/module.ts` para a mesma nota.
//
// Projetos agrupam tarefas e, no Alfred, também custo — é o encontro natural com o
// módulo fin (quanto este projeto já custou). Esse cruzamento é a razão de os dois
// serem módulos do mesmo assistente, e não dois apps.
export const projectsModule: ModuleDefinition = {
  id: "projects",
  title: "Projetos",
  description:
    "Trabalhos maiores que agrupam tarefas: acompanhar andamento, prazo e o que já foi " +
    "gasto em cada projeto.",
  implemented: false,
  commands: [{ name: "projetos", summary: "seus projetos e o andamento de cada um" }],
};
