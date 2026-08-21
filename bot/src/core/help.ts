import { Language } from "../models/User";
import { t } from "../i18n";
import { MODULES } from "../modules/registry";
import { CHASSIS_COMMAND_CATALOG } from "./commands";

// O texto do `/ajuda`, montado a partir do registro de módulos.
//
// **Derivado, nunca escrito à mão.** Uma ajuda digitada num arquivo à parte é uma
// segunda lista de comandos, e duas listas divergem: o comando entra no módulo, ninguém
// lembra da ajuda, e o usuário passa a ler uma lista que mente. Aqui, comando novo
// aparece na ajuda porque foi declarado no módulo — não há o que esquecer.
//
// A ordem é intencional: os módulos primeiro, porque é o que o Alfred *faz*; a conta
// por último, porque é manutenção. E a primeira linha diz que comando é atalho, não o
// caminho — o caminho é conversar (Fase 3 do roadmap).

/** Monta a ajuda no idioma do usuário. */
export function buildHelp(lang: Language): string {
  const sections = [t(lang, "help_intro"), ""];

  for (const mod of MODULES) {
    const title = `${mod.icon} ${t(lang, mod.titleKey)}`;
    // Módulo declarado e não construído continua aparecendo, marcado. Esconder daria
    // a impressão de que o Alfred não pretende fazer aquilo; mostrar sem marca faria
    // o usuário tentar e bater no vazio.
    const heading = mod.implemented ? title : `${title} — _${t(lang, "help_module_unavailable")}_`;

    sections.push(`*${heading}*`);
    for (const command of mod.commands) {
      sections.push(`/${command.name} — ${t(lang, command.summaryKey)}`);
    }
    sections.push("");
  }

  sections.push(`*${t(lang, "help_chassis_title")}*`);
  for (const command of CHASSIS_COMMAND_CATALOG) {
    sections.push(`/${command.name} — ${t(lang, command.summaryKey)}`);
  }

  sections.push("", t(lang, "help_footer"));

  return sections.join("\n");
}

/** Idiomas em que o menu de comandos é publicado. Os mesmos do catálogo de i18n. */
export const MENU_LANGUAGES: Language[] = ["pt", "en", "es"];

/**
 * O mesmo catálogo, achatado em `(nome, resumo)`.
 *
 * Serve o menu nativo do Telegram, que quer uma lista rasa. Módulo não construído fica
 * **de fora**: no menu não cabe a marca de "ainda não disponível", e um item que só
 * responde "ainda não" ocupa espaço prometendo o que não entrega. Na ajuda, onde há
 * espaço para a ressalva, ele continua aparecendo.
 */
export function helpCommands(lang: Language): Array<{ name: string; summary: string }> {
  const fromModules = MODULES.filter((m) => m.implemented).flatMap((m) =>
    m.commands.map((c) => ({ name: c.name, summary: t(lang, c.summaryKey) })),
  );
  const fromChassis = CHASSIS_COMMAND_CATALOG.map((c) => ({
    name: c.name,
    summary: t(lang, c.summaryKey),
  }));

  return [...fromModules, ...fromChassis];
}
