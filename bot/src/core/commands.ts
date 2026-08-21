import { moduleCommands } from "../modules/registry";
import { MessageKey } from "../i18n";

// Comandos do chassi: conta, identidade e preferências. Não pertencem a módulo nenhum —
// existiriam igual num assistente que não soubesse o que é uma compra.
//
// Cada um traz a chave do resumo pelo mesmo motivo que os de módulo (ver
// `modules/ModuleDefinition.ts`): o `/ajuda` é lido pelo usuário, e usuário tem idioma.
export interface ChassisCommand {
  name: string;
  summaryKey: MessageKey;
}

export const CHASSIS_COMMAND_CATALOG: ChassisCommand[] = [
  { name: "start", summaryKey: "cmd_start" },
  { name: "ajuda", summaryKey: "cmd_ajuda" },
  { name: "ia", summaryKey: "cmd_ia" },
  { name: "idioma", summaryKey: "cmd_idioma" },
  { name: "nome", summaryKey: "cmd_nome" },
  { name: "vincular", summaryKey: "cmd_vincular" },
  { name: "email", summaryKey: "cmd_email" },
  { name: "codigo", summaryKey: "cmd_codigo" },
  { name: "excluir_conta", summaryKey: "cmd_excluir_conta" },
];

export const CHASSIS_COMMANDS = CHASSIS_COMMAND_CATALOG.map((c) => c.name);

// Comandos que viram kind "command" (o resto é texto). O Telegram registra-os
// nativamente; os adapters baseados em texto (WhatsApp, Web) usam esta lista para
// decidir. Os de módulo saem do registro — uma lista só, para não divergirem.
export const KNOWN_COMMANDS = [...CHASSIS_COMMANDS, ...moduleCommands()];
