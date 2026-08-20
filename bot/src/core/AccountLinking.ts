import { inject, injectable } from "inversify";
import { Platform } from "./IncomingMessage";
import { MergeService } from "../services/MergeService";
import { LinkTokenService } from "../services/LinkTokenService";

// Vínculo de contas entre plataformas (Fase 6) — a parte que o chassi precisa saber.
//
// Os dois caminhos abaixo são chamados de três lugares (`/start` com deep-link,
// `/vincular`, e a primeira mensagem no WhatsApp), o que os tornava métodos privados
// do `BotCore` compartilhados por handlers distantes. Aqui viram um colaborador.
@injectable()
export class AccountLinking {
  constructor(
    @inject(MergeService) private mergeService: MergeService,
    @inject(LinkTokenService) private linkTokens: LinkTokenService,
  ) {}

  /**
   * Consome o token de vínculo (uso único) e funde a identidade atual na conta
   * canônica do web. `false` quando o token não existe, expirou ou já foi usado.
   */
  async tryLink(platform: Platform, externalId: string, token: string): Promise<boolean> {
    const canonicalUserId = await this.linkTokens.consume(token);
    if (!canonicalUserId) return false;
    return this.mergeService.linkAccounts(platform, externalId, canonicalUserId);
  }

  /**
   * No WhatsApp o `externalId` **é** o número verificado pela operadora — então ele
   * vale como telefone verificado, e serve de chave para auto-vincular com uma conta
   * existente do mesmo número. Nas outras plataformas, não faz nada.
   */
  async autoLinkWhatsappPhone(platform: Platform, externalId: string): Promise<void> {
    if (platform !== "whatsapp") return;
    await this.mergeService.linkVerifiedPhone(platform, externalId, externalId);
  }
}
