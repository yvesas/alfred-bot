import "reflect-metadata";
import {
  isDirectMessage,
  whatsappExternalId,
  whatsappText,
  toWhatsappIncoming,
  type WhatsappContent,
} from "../platforms/whatsapp/translate";

// C5 — sem socket e sem Baileys: só as funções de tradução com fixtures sintéticas.
// O footgun aqui é duplo: o texto chega em dois campos diferentes, e grupo/status/
// mensagem própria precisam ser descartados antes de qualquer coisa.

const download = () => Promise.resolve("base64-img");
const incoming = (content: WhatsappContent | null | undefined) =>
  toWhatsappIncoming("5548999990000", content, download);

describe("WhatsAppAdapter — o que é mensagem direta", () => {
  it("aceita conversa direta", () => {
    expect(isDirectMessage("5548999990000@s.whatsapp.net", false)).toBe(true);
  });

  it("descarta grupo", () => {
    expect(isDirectMessage("120363000000000000@g.us", false)).toBe(false);
  });

  it("descarta status/broadcast", () => {
    expect(isDirectMessage("status@broadcast", false)).toBe(false);
  });

  // Sem isto o bot responderia à própria mensagem e entraria em laço.
  it("descarta a própria mensagem do bot", () => {
    expect(isDirectMessage("5548999990000@s.whatsapp.net", true)).toBe(false);
  });

  it("descarta jid ausente", () => {
    expect(isDirectMessage(null, false)).toBe(false);
    expect(isDirectMessage(undefined, false)).toBe(false);
  });

  // O externalId é o número, e é por isso que ele vale como telefone verificado.
  it("extrai o número do jid", () => {
    expect(whatsappExternalId("5548999990000@s.whatsapp.net")).toBe("5548999990000");
  });
});

describe("WhatsAppAdapter — de onde sai o texto", () => {
  it("lê mensagem simples em `conversation`", () => {
    expect(whatsappText({ conversation: "agua 7" })).toBe("agua 7");
  });

  // Resposta, citação e link com preview chegam por aqui. Ler só `conversation`
  // perderia metade das mensagens reais.
  it("lê resposta/citação em `extendedTextMessage`", () => {
    expect(whatsappText({ extendedTextMessage: { text: "quanto gastei?" } })).toBe(
      "quanto gastei?",
    );
  });

  it("prefere `conversation` quando os dois vêm", () => {
    expect(
      whatsappText({ conversation: "primeiro", extendedTextMessage: { text: "segundo" } }),
    ).toBe("primeiro");
  });

  it("devolve undefined quando não há texto", () => {
    expect(whatsappText({})).toBeUndefined();
    expect(whatsappText(null)).toBeUndefined();
    expect(whatsappText(undefined)).toBeUndefined();
  });
});

describe("WhatsAppAdapter — tradução para IncomingMessage", () => {
  it("normaliza texto", () => {
    expect(incoming({ conversation: "agua 7" })).toMatchObject({
      platform: "whatsapp",
      externalId: "5548999990000",
      kind: "text",
      text: "agua 7",
    });
  });

  it("reconhece comando conhecido", () => {
    const msg = incoming({ conversation: "/gastos" });

    expect(msg?.kind).toBe("command");
    expect(msg?.command).toEqual({ name: "gastos", args: [] });
  });

  it("separa os argumentos do comando", () => {
    expect(incoming({ conversation: "/editar 2 total 10" })?.command).toEqual({
      name: "editar",
      args: ["2", "total", "10"],
    });
  });

  it("aceita comando em maiúscula", () => {
    expect(incoming({ conversation: "/GASTOS" })?.command?.name).toBe("gastos");
  });

  it("tolera espaço extra entre os argumentos", () => {
    expect(incoming({ conversation: "/editar   2   total   10" })?.command?.args).toEqual([
      "2",
      "total",
      "10",
    ]);
  });

  // Deliberado: a IA pode entender o que a lista de comandos não conhece.
  it("comando desconhecido segue como texto", () => {
    const msg = incoming({ conversation: "/inventado" });

    expect(msg?.kind).toBe("text");
    expect(msg?.text).toBe("/inventado");
  });

  it("reconhece comando vindo por resposta/citação", () => {
    expect(incoming({ extendedTextMessage: { text: "/compras 2" } })?.command).toEqual({
      name: "compras",
      args: ["2"],
    });
  });

  it("normaliza imagem sem baixá-la na tradução", async () => {
    const msg = incoming({ imageMessage: { url: "..." } });

    expect(msg?.kind).toBe("photo");
    await expect(msg!.getImageBase64!()).resolves.toBe("base64-img");
  });

  // Imagem com legenda ainda é imagem: o cupom é o que importa.
  it("imagem tem precedência sobre o texto que a acompanha", () => {
    expect(incoming({ imageMessage: {}, conversation: "olha o cupom" })?.kind).toBe("photo");
  });

  it("ignora mensagem sem texto e sem imagem (áudio, sticker, sistema)", () => {
    expect(incoming({})).toBeNull();
    expect(incoming(null)).toBeNull();
  });

  it("mensagem vazia é texto vazio, não descarte", () => {
    // "" é diferente de ausência: o usuário mandou algo, mesmo que vazio.
    expect(incoming({ conversation: "" })?.kind).toBe("text");
  });
});
