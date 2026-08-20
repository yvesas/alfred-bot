import { ModuleDefinition, ModuleId } from "./ModuleDefinition";
import { finModule } from "./fin/module";
import { tasksModule } from "./tasks/module";
import { projectsModule } from "./projects/module";

// Registro dos módulos do Alfred. É a única lista — o catálogo de comandos, a ajuda e
// (futuramente) o prompt do roteador saem daqui, não de listas paralelas.
export const MODULES: ModuleDefinition[] = [finModule, tasksModule, projectsModule];

export function findModule(id: ModuleId): ModuleDefinition | undefined {
  return MODULES.find((m) => m.id === id);
}

// Módulo que atende um comando, se algum atender.
export function moduleForCommand(command: string): ModuleDefinition | undefined {
  const name = command.toLowerCase();
  return MODULES.find((m) => m.commands.some((c) => c.name === name));
}

// Comandos de módulo que ainda não têm implementação. O BotCore usa isto para responder
// "ainda não disponível" em vez de ficar mudo.
export function isDeclaredButNotImplemented(command: string): boolean {
  const owner = moduleForCommand(command);
  return owner !== undefined && !owner.implemented;
}

// Todos os comandos de todos os módulos.
export function moduleCommands(): string[] {
  return MODULES.flatMap((m) => m.commands.map((c) => c.name));
}
