import { CommandDefinition } from "./CommandContext";
import { FIN_COMMANDS } from "../modules/fin/commands";

// Onde os comandos se registram. Uma lista só, montada a partir dos módulos — como o
// catálogo de nomes em `modules/registry.ts`, e pelo mesmo motivo: duas listas divergem.
//
// O chassi (start, ia, idioma, nome, vincular, email, codigo, excluir_conta) ainda é
// resolvido por `switch` dentro do BotCore. É o passo 3 do C4.
const COMMANDS: CommandDefinition[] = [...FIN_COMMANDS];

const BY_NAME = new Map(COMMANDS.map((c) => [c.name, c]));

export function findCommand(name: string): CommandDefinition | undefined {
  return BY_NAME.get(name.toLowerCase());
}

export function registeredCommandNames(): string[] {
  return [...BY_NAME.keys()];
}
