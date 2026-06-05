export type Role = "user" | "bot";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
}

// Protocolo WebSocket — espelha o WebAdapter do bot.
export type Outbound =
  | { type: "user_message"; clientId: string; text: string }
  | { type: "user_photo"; clientId: string; imageBase64: string };

export type Inbound =
  | { type: "bot_message"; text: string }
  | { type: "typing"; value: boolean }
  | { type: "error"; message: string };

export type ConnectionStatus = "connecting" | "open" | "closed";
