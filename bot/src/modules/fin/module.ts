import { ModuleDefinition } from "../ModuleDefinition";

// O único módulo implementado hoje. O domínio dele — Purchase, Product, Reminder,
// orçamentos, categorias, NFC-e — ainda mora em `services/`, `repositories/` e `models/`.
// Ver `modules/README.md` para o que muda de lugar e quando.
export const finModule: ModuleDefinition = {
  id: "fin",
  title: "Finanças",
  description:
    "Gastos, compras e cupons fiscais: registrar o que foi gasto por texto ou foto de " +
    "cupom, consultar quanto se gastou por período, categoria ou loja, orçamento mensal " +
    "com alerta, contas a pagar, despensa e exportação dos dados.",
  implemented: true,
  commands: [
    { name: "gastos", summary: "quanto você gastou no período" },
    { name: "compras", summary: "histórico de compras, paginado" },
    { name: "editar", summary: "corrige o valor ou a descrição de uma compra" },
    { name: "excluir", summary: "apaga uma compra do histórico" },
    { name: "categorias", summary: "suas categorias de gasto" },
    { name: "orcamento", summary: "limite mensal por categoria, com alerta" },
    { name: "exportar", summary: "baixa suas compras em CSV" },
    { name: "estoque", summary: "o que tem na despensa" },
    // Nasceu como "contas a pagar" e é a semente do módulo de tarefas: um lembrete
    // recorrente já é uma tarefa com data. Quando `tasks` existir, decidir se migra.
    { name: "lembretes", summary: "lembretes recorrentes de contas a pagar" },
  ],
};
