import { IncomingMessage } from "../../core/IncomingMessage";

// Tradução Telegram → IncomingMessage.
//
// Vive fora do adapter pelo mesmo motivo que a do WhatsApp: um arquivo que importa o
// SDK da plataforma é caro (ou impossível) de testar, e foi assim que os dois adapters
// chegaram a 0 % de cobertura (C5). Aqui não há Telegraf — só dado de entrada e
// IncomingMessage de saída.
//
// O footgun do Telegram: a mesma foto vem em vários tamanhos, o contato compartilhado
// pode ser de outra pessoa, e o comando chega junto com a mensagem inteira.

/** Só o que a tradução precisa de `ctx.from` — evita depender dos tipos do Telegraf. */
export interface TelegramSender {
  id?: number;
  first_name?: string;
  last_name?: string;
}

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  user_id?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
}

export function telegramProfile(from?: TelegramSender) {
  return { firstName: from?.first_name, lastName: from?.last_name };
}

/**
 * Argumentos de um comando. O Telegram entrega a mensagem inteira ("/editar 2 total 10"),
 * então o primeiro token é o comando e o resto são os argumentos.
 */
export function telegramCommandArgs(text: string): string[] {
  return text.split(" ").slice(1);
}

export function toTelegramText(from: TelegramSender | undefined, text: string): IncomingMessage {
  return {
    platform: "telegram",
    externalId: String(from?.id),
    kind: "text",
    text,
    profile: telegramProfile(from),
  };
}

export function toTelegramCommand(
  from: TelegramSender | undefined,
  name: string,
  text: string,
): IncomingMessage {
  return {
    platform: "telegram",
    externalId: String(from?.id),
    kind: "command",
    command: { name, args: telegramCommandArgs(text) },
    profile: telegramProfile(from),
  };
}

export function toTelegramPhoto(
  from: TelegramSender | undefined,
  getImageBase64: () => Promise<string>,
): IncomingMessage {
  return {
    platform: "telegram",
    externalId: String(from?.id),
    kind: "photo",
    getImageBase64,
  };
}

export function toTelegramContact(externalId: string, contact: TelegramContact): IncomingMessage {
  return {
    platform: "telegram",
    externalId,
    kind: "contact",
    contact: { phone: contact.phone_number, name: contact.first_name },
  };
}

/**
 * O contato compartilhado é do próprio usuário? Um contato da agenda vem sem
 * `user_id` — aceitamos, porque é o telefone que a pessoa escolheu informar. O que
 * recusamos é o contato de OUTRO usuário do Telegram, que viria com `user_id` alheio
 * e viraria telefone verificado de quem não é.
 */
export function isOwnContact(contact: TelegramContact, externalId: string): boolean {
  return !contact.user_id || String(contact.user_id) === externalId;
}

/** O Telegram manda a mesma foto em vários tamanhos; o último é o maior. */
export function bestResolution<T extends TelegramPhotoSize>(photos: readonly T[]): T {
  return photos[photos.length - 1];
}
