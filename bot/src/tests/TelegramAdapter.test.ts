import "reflect-metadata";
import {
  telegramProfile,
  telegramCommandArgs,
  toTelegramText,
  toTelegramCommand,
  toTelegramPhoto,
  toTelegramContact,
  isOwnContact,
  bestResolution,
  type TelegramSender,
  type TelegramContact,
} from "../platforms/telegram/translate";

// C5 — os adapters estavam em 0 % de cobertura, e é neles que mora o footgun de cada
// plataforma. Aqui não há rede nem Telegraf: só as funções de tradução e fixtures
// sintéticas de update.

const sender = (over: Partial<TelegramSender> = {}): TelegramSender => ({
  id: 12345,
  first_name: "Ana",
  last_name: "Souza",
  ...over,
});

describe("TelegramAdapter — tradução para IncomingMessage", () => {
  describe("perfil", () => {
    it("aproveita o nome que o Telegram já entrega", () => {
      expect(telegramProfile(sender())).toEqual({ firstName: "Ana", lastName: "Souza" });
    });

    it("não quebra com sobrenome ausente — é opcional no Telegram", () => {
      expect(telegramProfile(sender({ last_name: undefined }))).toEqual({
        firstName: "Ana",
        lastName: undefined,
      });
    });

    it("não quebra sem remetente", () => {
      expect(telegramProfile(undefined)).toEqual({ firstName: undefined, lastName: undefined });
    });
  });

  describe("texto", () => {
    it("normaliza uma mensagem de texto", () => {
      const msg = toTelegramText(sender(), "agua 7");

      expect(msg).toMatchObject({
        platform: "telegram",
        externalId: "12345",
        kind: "text",
        text: "agua 7",
      });
    });

    it("converte o id numérico para string — o domínio trabalha com string", () => {
      expect(toTelegramText(sender({ id: 999 }), "oi").externalId).toBe("999");
    });
  });

  describe("comando", () => {
    it("separa o comando dos argumentos", () => {
      const msg = toTelegramCommand(sender(), "editar", "/editar 2 total 10");

      expect(msg.kind).toBe("command");
      expect(msg.command).toEqual({ name: "editar", args: ["2", "total", "10"] });
    });

    it("comando sem argumento vem com lista vazia, não undefined", () => {
      expect(toTelegramCommand(sender(), "gastos", "/gastos").command?.args).toEqual([]);
    });

    it("preserva argumento com espaço como tokens separados", () => {
      // "/orcamento Alimentação 500" — o BotCore junta tudo menos o último token.
      const args = toTelegramCommand(sender(), "orcamento", "/orcamento Alimentação 500").command
        ?.args;
      expect(args).toEqual(["Alimentação", "500"]);
    });

    it("aguenta texto vazio (comando disparado sem mensagem)", () => {
      expect(telegramCommandArgs("")).toEqual([]);
    });

    it("mantém o payload do deep-link de vínculo em /start", () => {
      // t.me/bot?start=<token> chega como "/start <token>" — é assim que o vínculo entra.
      const msg = toTelegramCommand(sender(), "start", "/start AbC123_-xy");
      expect(msg.command?.args[0]).toBe("AbC123_-xy");
    });

    it("leva o perfil junto — o cadastro aproveita o nome sem perguntar", () => {
      expect(toTelegramCommand(sender(), "start", "/start").profile).toEqual({
        firstName: "Ana",
        lastName: "Souza",
      });
    });
  });

  describe("foto", () => {
    it("não baixa a imagem na tradução — só quando pedida", async () => {
      const download = jest.fn().mockResolvedValue("base64-img");
      const msg = toTelegramPhoto(sender(), download);

      expect(msg.kind).toBe("photo");
      expect(download).not.toHaveBeenCalled();

      await expect(msg.getImageBase64!()).resolves.toBe("base64-img");
      expect(download).toHaveBeenCalledTimes(1);
    });

    // O Telegram manda a MESMA foto em vários tamanhos. Pegar o primeiro entrega uma
    // miniatura ilegível para o OCR.
    it("escolhe a maior resolução", () => {
      const photos = [{ file_id: "thumb" }, { file_id: "media" }, { file_id: "full" }];
      expect(bestResolution(photos).file_id).toBe("full");
    });
  });

  describe("contato", () => {
    const contact = (over: Partial<TelegramContact> = {}): TelegramContact => ({
      phone_number: "+5548999990000",
      first_name: "Ana",
      ...over,
    });

    it("normaliza o contato compartilhado", () => {
      expect(toTelegramContact("12345", contact())).toEqual({
        platform: "telegram",
        externalId: "12345",
        kind: "contact",
        contact: { phone: "+5548999990000", name: "Ana" },
      });
    });

    it("aceita o contato do próprio usuário", () => {
      expect(isOwnContact(contact({ user_id: 12345 }), "12345")).toBe(true);
    });

    // O telefone vira `verifiedPhone` e serve de chave de fusão de contas: aceitar o
    // contato de outro usuário deixaria alguém reivindicar o telefone alheio.
    it("recusa o contato de OUTRO usuário do Telegram", () => {
      expect(isOwnContact(contact({ user_id: 777 }), "12345")).toBe(false);
    });

    it("aceita contato da agenda, que vem sem user_id", () => {
      expect(isOwnContact(contact(), "12345")).toBe(true);
    });
  });
});
