import { CommandDefinition } from "./CommandContext";
import { FIN_COMMANDS } from "../modules/fin/commands";
import { CHASSIS_COMMAND_HANDLERS } from "./chassisCommands";

// Onde os comandos se registram. Uma lista só, montada a partir dos módulos e do
// chassi — como o catálogo de nomes em `modules/registry.ts`, e pelo mesmo motivo:
// duas listas divergem.
//
// Não há mais `switch` de comando em lugar nenhum: o BotCore resolve pelo registro e
// não sabe o que cada comando faz.
const COMMANDS: CommandDefinition[] = [...CHASSIS_COMMAND_HANDLERS, ...FIN_COMMANDS];

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

export function findCommand(name: string): CommandDefinition | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export function registeredCommandNames(): string[] {
  return [...BY_NAME.keys()];
}

// Um nome com dois donos silenciaria um dos dois — o Map ficaria com o último. Falha
// na carga do módulo, que é quando ainda dá para consertar sem investigar em produção.
const duplicated = COMMANDS.map((c) => c.name).filter((n, i, all) => all.indexOf(n) !== i);
if (duplicated.length > 0) {
  throw new Error(`Comandos declarados mais de uma vez: ${duplicated.join(", ")}`);
}
