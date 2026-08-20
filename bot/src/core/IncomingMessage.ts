// Mensagem normalizada, independente de plataforma. Cada adapter (Telegram, WhatsApp, ...)
// traduz os eventos do seu SDK para este formato e entrega ao BotCore.
export type Platform = "telegram" | "whatsapp" | "web";

export type MessageKind = "text" | "photo" | "command" | "contact";

export interface IncomingMessage {
  platform: Platform;
  externalId: string; // id do usuário na plataforma (telegram id, número do WhatsApp, ...)
  kind: MessageKind;

  text?: string;
  command?: { name: string; args: string[] };
  contact?: {
    phone: string;
    name?: string;
    /**
     * O contato é do próprio remetente? Só o adapter sabe dizer — no Telegram vem do
     * `user_id` do contato. `false` significa que a pessoa compartilhou o contato de
     * OUTRA, o que não pode virar telefone verificado dela.
     *
     * Ausente quando a plataforma não informa; nesse caso o núcleo aceita.
     */
    belongsToSender?: boolean;
  };

  // Perfil que algumas plataformas já entregam (Telegram: nome).
  profile?: { firstName?: string; lastName?: string };

  // Baixa a imagem (sob demanda) quando kind === "photo".
  getImageBase64?: () => Promise<string>;
}
