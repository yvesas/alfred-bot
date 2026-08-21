import { ModuleDefinition } from "../ModuleDefinition";

// O único módulo implementado hoje. O domínio dele — Purchase, Product, Reminder,
// orçamentos, categorias, NFC-e — ainda mora em `services/`, `repositories/` e `models/`.
// Ver `modules/README.md` para o que muda de lugar e quando.
export const finModule: ModuleDefinition = {
  id: "fin",
  titleKey: "module_fin_title",
  icon: "💰",
  description:
    "Gastos, compras e cupons fiscais: registrar o que foi gasto por texto ou foto de " +
    "cupom, consultar quanto se gastou por período, categoria ou loja, orçamento mensal " +
    "com alerta, contas a pagar, despensa e exportação dos dados.",
  implemented: true,
  commands: [
    { name: "gastos", summaryKey: "cmd_gastos" },
    { name: "compras", summaryKey: "cmd_compras" },
    { name: "editar", summaryKey: "cmd_editar" },
    { name: "excluir", summaryKey: "cmd_excluir" },
    { name: "categorias", summaryKey: "cmd_categorias" },
    { name: "orcamento", summaryKey: "cmd_orcamento" },
    { name: "exportar", summaryKey: "cmd_exportar" },
    { name: "estoque", summaryKey: "cmd_estoque" },
    // Nasceu como "contas a pagar" e é a semente do módulo de tarefas: um lembrete
    // recorrente já é uma tarefa com data. Quando `tasks` existir, decidir se migra.
    { name: "lembretes", summaryKey: "cmd_lembretes" },
  ],
};
