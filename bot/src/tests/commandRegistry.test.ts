import "reflect-metadata";
import { findCommand, registeredCommandNames } from "../core/commandRegistry";
import { CHASSIS_COMMANDS, KNOWN_COMMANDS } from "../core/commands";
import { finModule } from "../modules/fin/module";
import { parsePage } from "../modules/fin/commands";

// C4 — os comandos saíram de um `switch` de 19 casos dentro do BotCore. O registro é o
// que impede que voltem: um comando é um objeto que se declara, não um `case`.
describe("registro de comandos", () => {
  it("resolve os comandos do módulo fin", () => {
    expect(findCommand("gastos")?.name).toBe("gastos");
    expect(findCommand("orcamento")?.name).toBe("orcamento");
  });

  it("é case-insensitive, como o adapter do WhatsApp entrega", () => {
    expect(findCommand("GASTOS")?.name).toBe("gastos");
  });

  it("não conhece comando inexistente", () => {
    expect(findCommand("inventado")).toBeUndefined();
  });

  // O chassi ainda é resolvido por `switch` no BotCore (passo 3 do C4). Enquanto for
  // assim, ele NÃO pode estar no registro — dois donos para o mesmo comando é bug.
  it("não reivindica comando do chassi", () => {
    for (const name of CHASSIS_COMMANDS) {
      expect(findCommand(name)).toBeUndefined();
    }
  });

  // A razão de o registro existir: uma lista só. Se um comando é declarado no módulo
  // mas não tem handler, o usuário digita e não acontece nada.
  it("todo comando declarado pelo módulo fin tem handler", () => {
    for (const command of finModule.commands) {
      expect(findCommand(command.name)).toBeDefined();
    }
  });

  it("todo handler registrado está declarado em algum módulo", () => {
    for (const name of registeredCommandNames()) {
      expect(KNOWN_COMMANDS).toContain(name);
    }
  });

  it("todo comando do fin exige cadastro", () => {
    for (const name of registeredCommandNames()) {
      expect(findCommand(name)?.requiresRegistration).toBe(true);
    }
  });
});

describe("parsePage", () => {
  it("lê a página pedida", () => {
    expect(parsePage("3")).toBe(3);
  });

  // Entrada inválida cai na primeira página em vez de reclamar: `/compras` sem
  // argumento é o uso mais comum.
  it("cai na primeira página quando o argumento não serve", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("1.5")).toBe(1);
  });
});
