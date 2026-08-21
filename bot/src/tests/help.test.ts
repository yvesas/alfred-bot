import "reflect-metadata";
import { buildHelp, helpCommands, MENU_LANGUAGES } from "../core/help";
import { KNOWN_COMMANDS, CHASSIS_COMMANDS } from "../core/commands";
import { MODULES } from "../modules/registry";
import { registeredCommandNames } from "../core/commandRegistry";
import { t } from "../i18n";
import { Language } from "../models/User";

const LANGS: Language[] = ["pt", "en", "es"];

describe("ajuda derivada do registro", () => {
  it.each(LANGS)("em %s, lista todo comando de módulo implementado", (lang) => {
    const help = buildHelp(lang);

    for (const mod of MODULES.filter((m) => m.implemented)) {
      for (const command of mod.commands) {
        expect(help).toContain(`/${command.name}`);
      }
    }
  });

  it.each(LANGS)("em %s, lista todo comando do chassi", (lang) => {
    const help = buildHelp(lang);

    for (const name of CHASSIS_COMMANDS) {
      expect(help).toContain(`/${name}`);
    }
  });

  // O ponto da fase: comando é atalho, conversa é o caminho. Se a ajuda abrir com uma
  // parede de comandos, ela ensina o contrário do que o produto quer.
  it("abre dizendo que não é preciso decorar comando", () => {
    expect(buildHelp("pt").split("\n")[0]).toBe(t("pt", "help_intro"));
  });

  // Esconder o módulo declarado sugeriria que o Alfred não pretende fazer aquilo;
  // mostrá-lo sem marca faria o usuário tentar e bater no "ainda não".
  it("mostra o módulo declarado, marcado como indisponível", () => {
    const help = buildHelp("pt");

    expect(help).toContain(t("pt", "module_projects_title"));
    expect(help).toContain(t("pt", "help_module_unavailable"));
  });

  // O texto sai do catálogo tipado, então o que este teste pega é o descuido de deixar
  // um resumo igual em três idiomas — sinal de tradução esquecida.
  it("traduz de verdade, não repete o português", () => {
    expect(buildHelp("en")).not.toBe(buildHelp("pt"));
    expect(buildHelp("es")).not.toBe(buildHelp("pt"));
  });
});

describe("menu de comandos do Telegram", () => {
  it.each(MENU_LANGUAGES)("em %s, todo item cabe no limite do Telegram", (lang) => {
    for (const { name, summary } of helpCommands(lang)) {
      expect(name).toMatch(/^[a-z0-9_]{1,32}$/); // exigência do Bot API
      expect(summary.length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(256);
    }
  });

  // Menu é lista rasa, sem lugar para a ressalva de "ainda não disponível".
  it("não anuncia comando de módulo não construído", () => {
    const names = helpCommands("pt").map((c) => c.name);

    for (const mod of MODULES.filter((m) => !m.implemented)) {
      for (const command of mod.commands) {
        expect(names).not.toContain(command.name);
      }
    }
  });
});

// A guarda que faltava: `/tarefas` nasceu na Fase 1 declarado no módulo e com handler,
// mas ninguém o registrou no TelegramAdapter — que tinha 16 `bot.command(...)` escritos
// à mão. Resultado: no Telegram ele chegava como texto e ia para a IA como se fosse uma
// compra. Hoje o adapter percorre `KNOWN_COMMANDS`, e este teste trava as três listas
// juntas para elas não voltarem a divergir.
describe("as listas de comandos não divergem", () => {
  it("todo handler registrado é um comando conhecido", () => {
    for (const name of registeredCommandNames()) {
      expect(KNOWN_COMMANDS).toContain(name);
    }
  });

  it("todo comando do menu é um comando conhecido", () => {
    for (const { name } of helpCommands("pt")) {
      expect(KNOWN_COMMANDS).toContain(name);
    }
  });
});
