import "reflect-metadata";

// C19 — o `jimp` usa import dinâmico e o ts-jest deste projeto compila para CommonJS,
// então carregá-lo de verdade despejava um stack trace de
// `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` a cada execução. O teste passava, mas
// o log sujo esconde falha real — foi assim que a instabilidade do `JobLockService`
// quase passou batida.
//
// Mockar o `jimp` resolve o ruído e, de quebra, deixa o teste cobrir o que antes não
// dava: o caminho de sucesso e a leitura do conteúdo do QR.
const jimpRead = jest.fn();
jest.mock("jimp", () => ({ Jimp: { read: (...args: unknown[]) => jimpRead(...args) } }));

const jsQrDecode = jest.fn();
jest.mock("jsqr", () => ({
  __esModule: true,
  default: (...args: unknown[]) => jsQrDecode(...args),
}));

import { QrService } from "../services/QrService";

describe("QrService", () => {
  let svc: QrService;

  // Uma imagem qualquer: o que importa é o formato que o jsQR recebe.
  const bitmap = { data: Buffer.alloc(4 * 2 * 2), width: 2, height: 2 };

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new QrService();
    jimpRead.mockResolvedValue({ bitmap });
  });

  it("devolve o conteúdo do QR quando a imagem tem um", async () => {
    // O QR da NFC-e carrega a URL da SEFAZ, com a chave de acesso dentro.
    const url = "https://www.fazenda.sp.gov.br/nfce/qrcode?p=" + "3".repeat(44);
    jsQrDecode.mockReturnValue({ data: url });

    expect(await svc.decode("base64-img")).toBe(url);
  });

  it("devolve null quando a imagem não tem QR", async () => {
    jsQrDecode.mockReturnValue(null);

    expect(await svc.decode("base64-img")).toBeNull();
  });

  // O caminho que já era testado: entrada que nem é imagem. Não pode lançar — o
  // decode do QR é um fallback, e falhar nele não pode derrubar a leitura do cupom.
  it("devolve null, sem lançar, quando a imagem é inválida", async () => {
    jimpRead.mockRejectedValue(new Error("não é uma imagem"));

    expect(await svc.decode("isto-nao-e-uma-imagem")).toBeNull();
  });

  it("passa largura e altura ao decodificador", async () => {
    jsQrDecode.mockReturnValue(null);

    await svc.decode("base64-img");

    expect(jsQrDecode).toHaveBeenCalledWith(expect.anything(), 2, 2);
  });
});
