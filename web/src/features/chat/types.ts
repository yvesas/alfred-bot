export type Role = "user" | "bot";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
}

// Protocolo WebSocket — espelha o WebAdapter do bot.
// `token` (JWT) é opcional: presente quando logado, define a identidade canônica no servidor.
export type Outbound =
  | { type: "user_message"; clientId: string; text: string; token?: string }
  | { type: "user_photo"; clientId: string; imageBase64: string; token?: string };

export type Inbound =
  | { type: "bot_message"; text: string }
  | { type: "typing"; value: boolean }
  | { type: "error"; message: string }
  | { type: "download"; filename: string; mimeType: string; content: string }; // content em base64

export type ConnectionStatus = "connecting" | "open" | "closed";
