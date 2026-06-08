import {
  extractAccessKey,
  isValidAccessKey,
  accessKeyCheckDigit,
  parseAccessKey,
} from "../utils/fiscalKey";

// Constrói uma chave válida: 43 dígitos base (UF=35, AAMM=2406, CNPJ=...) + DV calculado.
const base43 = "35" + "2406" + "12345678000199" + "65" + "001" + "000000123" + "1" + "00000012";
const validKey = base43 + String(accessKeyCheckDigit(base43));

describe("fiscalKey", () => {
  it("valida o dígito verificador", () => {
    expect(validKey).toHaveLength(44);
    expect(isValidAccessKey(validKey)).toBe(true);
  });

  it("rejeita chave adulterada ou de tamanho errado", () => {
    const tampered = validKey.slice(0, 43) + (Number(validKey[43]) === 0 ? "1" : "0");
    expect(isValidAccessKey(tampered)).toBe(false);
    expect(isValidAccessKey("123")).toBe(false);
    expect(isValidAccessKey("x".repeat(44))).toBe(false);
  });

  it("extrai a chave de uma URL de QR da NFC-e", () => {
    const url = `https://www.fazenda.sp.gov.br/nfce/qrcode?p=${validKey}|2|1|1|ABCDEF`;
    expect(extractAccessKey(url)).toBe(validKey);
    expect(extractAccessKey("sem chave aqui")).toBeNull();
  });

  it("deriva UF, ano/mês e CNPJ", () => {
    const info = parseAccessKey(validKey);
    expect(info).toEqual({ uf: "35", year: 2024, month: 6, cnpj: "12345678000199" });
  });

  it("parseAccessKey retorna null para chave inválida (DV errado)", () => {
    expect(parseAccessKey("0".repeat(43) + "5")).toBeNull();
  });
});
