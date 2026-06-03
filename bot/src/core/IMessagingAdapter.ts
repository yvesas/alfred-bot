// Contrato de um adapter de plataforma de mensagens (Telegram, WhatsApp, ...).
// Cada adapter cuida do seu próprio ciclo de vida e delega a lógica ao BotCore.
export interface IMessagingAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
}
