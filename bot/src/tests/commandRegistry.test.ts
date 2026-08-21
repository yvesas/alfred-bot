import "reflect-metadata";
import { findCommand, registeredCommandNames } from "../core/commandRegistry";
import { CHASSIS_COMMANDS, KNOWN_COMMANDS } from "../core/commands";
import { finModule } from "../modules/fin/module";
import { moduleForCommand } from "../modules/registry";
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

  // Desde o passo 3 do C4 não há mais `switch` de comando: o chassi também se
  // resolve pelo registro.
  it("resolve também os comandos do chassi", () => {
    for (const name of CHASSIS_COMMANDS) {
      expect(findCommand(name)).toBeDefined();
    }
  });

  // Quem chega por deep-link ainda não tem conta; exigir cadastro antes tornaria o
  // vínculo impossível. São só estes dois — qualquer outro anônimo é engano.
  it("só /start e /vincular rodam antes do cadastro", () => {
    const anonymous = registeredCommandNames().filter(
      (n) => findCommand(n)?.requiresRegistration === false,
    );
    expect(anonymous.sort()).toEqual(["start", "vincular"]);
  });

  // O invariante que importa: nenhum comando cai no vazio. Ou ele tem handler, ou o
  // módulo dono está declarado como não construído — e aí o BotCore responde
  // "ainda não disponível" antes de procurar handler. `/tarefas` e `/projetos` são
  // exatamente esse caso.
  it("todo comando conhecido tem handler ou dono não construído", () => {
    for (const name of KNOWN_COMMANDS) {
      const hasHandler = findCommand(name) !== undefined;
      const ownerNotBuilt = moduleForCommand(name)?.implemented === false;
      expect(hasHandler || ownerNotBuilt).toBe(true);
    }
  });

  it("comando de módulo não construído não tem handler", () => {
    // `tarefas` saiu desta lista na Fase 1, quando o módulo foi construído.
    expect(findCommand("projetos")).toBeUndefined();
  });

  it("resolve o comando do módulo de tarefas", () => {
    expect(findCommand("tarefas")?.name).toBe("tarefas");
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
    for (const command of finModule.commands) {
      expect(findCommand(command.name)?.requiresRegistration).toBe(true);
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
