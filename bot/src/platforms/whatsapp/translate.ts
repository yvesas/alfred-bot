import { IncomingMessage } from "../../core/IncomingMessage";
import { KNOWN_COMMANDS } from "../../core/commands";

// Tradução WhatsApp → IncomingMessage.
//
// Vive fora do adapter de propósito: o Baileys é ESM puro e o Jest deste projeto é
// CommonJS, então qualquer arquivo que importe o SDK é intestável. Foi exatamente
// por isso que este adapter passou tanto tempo em 0 % de cobertura (C5). Aqui não há
// dependência de SDK nenhum — só dado de entrada e IncomingMessage de saída.
//
// O footgun do WhatsApp é duplo: o texto chega em dois campos diferentes, e
// grupo/status/mensagem própria precisam ser descartados antes de tudo.

/** Só o que a tradução precisa do payload do Baileys. */
export interface WhatsappContent {
  imageMessage?: unknown;
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
}

const DIRECT_JID_SUFFIX = "@s.whatsapp.net";

/**
 * Mensagem direta de outra pessoa? Grupo (`@g.us`), status (`status@broadcast`) e as
 * próprias mensagens do bot são descartados — responder a qualquer um deles seria, na
 * melhor hipótese, ruído; na pior, um laço com o próprio bot.
 */
export function isDirectMessage(jid: string | null | undefined, fromMe?: boolean | null): boolean {
  if (!jid || fromMe) return false;
  return jid.endsWith(DIRECT_JID_SUFFIX);
}

/** No WhatsApp o externalId é o próprio número — por isso ele vale como telefone verificado. */
export function whatsappExternalId(jid: string): string {
  return jid.split("@")[0];
}

/**
 * O texto chega em `conversation` (mensagem simples) ou em `extendedTextMessage.text`
 * (resposta, citação, link com preview). Ler só um dos dois perde metade das mensagens.
 */
export function whatsappText(content?: WhatsappContent | null): string | undefined {
  return content?.conversation ?? content?.extendedTextMessage?.text ?? undefined;
}

export function toWhatsappIncoming(
  externalId: string,
  content: WhatsappContent | null | undefined,
  getImageBase64: () => Promise<string>,
): IncomingMessage | null {
  if (content?.imageMessage) {
    return { platform: "whatsapp", externalId, kind: "photo", getImageBase64 };
  }

  const text = whatsappText(content);
  if (text === undefined || text === null) return null;

  if (text.startsWith("/")) {
    const [first, ...args] = text.slice(1).trim().split(/\s+/);
    const name = first.toLowerCase();
    // Comando desconhecido segue como texto: a IA pode entender o que a lista não conhece.
    if (KNOWN_COMMANDS.includes(name)) {
      return { platform: "whatsapp", externalId, kind: "command", command: { name, args } };
    }
  }

  return { platform: "whatsapp", externalId, kind: "text", text };
}
