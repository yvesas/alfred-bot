import { injectable } from "inversify";
import { Platform } from "./IncomingMessage";
import { logger } from "../infra/logger";

// Capacidade de envio NÃO-solicitado (push): mandar uma mensagem a um usuário
// sem que ele tenha escrito antes. Cada adapter de plataforma a implementa.
export interface OutboundSender {
  sendTo(externalId: string, text: string): Promise<boolean>;
}

// Registro de senders por plataforma. Os adapters se registram no start();
// serviços de background (ex.: ReminderScheduler) resolvem o sender pela plataforma.
// Singleton — a MESMA instância é injetada nos adapters e nos serviços.
@injectable()
export class OutboundRegistry {
  private readonly senders = new Map<Platform, OutboundSender>();

  register(platform: Platform, sender: OutboundSender): void {
    this.senders.set(platform, sender);
    logger.info({ platform }, "Outbound sender registrado");
  }

  // Envia para (platform, externalId). Retorna false se não houver sender ou se falhar
  // (ex.: usuário web offline). Não lança — o chamador decide o que fazer.
  async send(platform: Platform, externalId: string, text: string): Promise<boolean> {
    const sender = this.senders.get(platform);
    if (!sender) {
      logger.warn({ platform }, "Sem outbound sender para a plataforma");
      return false;
    }
    try {
      return await sender.sendTo(externalId, text);
    } catch (err) {
      logger.error({ err, platform, externalId }, "Falha ao enviar mensagem outbound");
      return false;
    }
  }
}
