export interface ReplyOptions {
  // Sugere ao usuário compartilhar o telefone (Telegram: botão de contato;
  // plataformas sem esse recurso simplesmente ignoram).
  requestPhone?: boolean;
}

// Forma como o BotCore responde — o adapter degrada o que a plataforma não suporta.
export interface Replier {
  text(message: string, options?: ReplyOptions): Promise<void>;
}
