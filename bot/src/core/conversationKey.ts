import { Platform } from "./IncomingMessage";

// Chave de estado de conversa: identifica "esta pessoa, neste canal".
//
// Usada por tudo que fica pendente entre duas mensagens — compra aguardando "sim/não",
// e-mail aguardando código. Hoje essas pendências vivem em memória, o que impede rodar
// com mais de uma instância (C2); quando forem para Redis, esta é a chave.
export function conversationKey(platform: Platform, externalId: string): string {
  return `${platform}:${externalId}`;
}
