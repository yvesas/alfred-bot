import "reflect-metadata";
import { MODULES, moduleForCommand, moduleCommands, findModule } from "../modules/registry";
import { KNOWN_COMMANDS, CHASSIS_COMMANDS } from "../core/commands";

describe("registro de módulos", () => {
  it("declara fin, tarefas e projetos", () => {
    expect(MODULES.map((m) => m.id).sort()).toEqual(["fin", "projects", "tasks"]);
  });

  it("fin e tarefas estão implementados; projetos não", () => {
    expect(findModule("fin")?.implemented).toBe(true);
    expect(findModule("tasks")?.implemented).toBe(true);
    expect(findModule("projects")?.implemented).toBe(false);
  });

  it("resolve o módulo dono de um comando", () => {
    expect(moduleForCommand("gastos")?.id).toBe("fin");
    expect(moduleForCommand("tarefas")?.id).toBe("tasks");
    expect(moduleForCommand("projetos")?.id).toBe("projects");
    expect(moduleForCommand("idioma")).toBeUndefined(); // chassi, não módulo
  });

  it("é case-insensitive no comando", () => {
    expect(moduleForCommand("GASTOS")?.id).toBe("fin");
  });

  // A razão de o registro existir: uma lista só. Antes, o catálogo de comandos era uma
  // constante solta e o TelegramAdapter repetia os nomes à mão — duas listas divergem.
  it("o catálogo de comandos sai do registro, sem lista paralela", () => {
    for (const command of moduleCommands()) {
      expect(KNOWN_COMMANDS).toContain(command);
    }
    for (const command of CHASSIS_COMMANDS) {
      expect(KNOWN_COMMANDS).toContain(command);
    }
    expect(KNOWN_COMMANDS.length).toBe(CHASSIS_COMMANDS.length + moduleCommands().length);
  });

  it("não repete um comando entre módulos", () => {
    const all = moduleCommands();
    expect(new Set(all).size).toBe(all.length);
  });

  it("nenhum comando de módulo colide com um do chassi", () => {
    for (const command of moduleCommands()) {
      expect(CHASSIS_COMMANDS).not.toContain(command);
    }
  });

  // O `description` é o que um modelo barato vai ler para rotear a mensagem ao módulo
  // certo. Vazio ou curto demais quebra o roteador antes de ele existir.
  it("todo módulo descreve o que trata, para o roteador", () => {
    for (const m of MODULES) {
      expect(m.description.length).toBeGreaterThan(40);
      expect(m.title).toBeTruthy();
      expect(m.commands.length).toBeGreaterThan(0);
    }
  });
});
