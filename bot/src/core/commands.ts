import { moduleCommands } from "../modules/registry";

// Comandos do chassi: conta, identidade e preferências. Não pertencem a módulo nenhum —
// existiriam igual num assistente que não soubesse o que é uma compra.
export const CHASSIS_COMMANDS = [
  "start",
  "ia",
  "idioma",
  "nome",
  "vincular",
  "email",
  "codigo",
  "excluir_conta",
];

// Comandos que viram kind "command" (o resto é texto). O Telegram registra-os
// nativamente; os adapters baseados em texto (WhatsApp, Web) usam esta lista para
// decidir. Os de módulo saem do registro — uma lista só, para não divergirem.
export const KNOWN_COMMANDS = [...CHASSIS_COMMANDS, ...moduleCommands()];
