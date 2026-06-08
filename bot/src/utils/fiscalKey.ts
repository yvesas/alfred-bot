// Chave de acesso da NFC-e/NF-e (44 dígitos). Permite obter dados estruturados (UF, ano/mês,
// CNPJ da loja) e validar a integridade pelo dígito verificador (mód. 11) — sem depender do OCR
// dos itens. Também serve de identificador único do cupom (deduplicação).

export interface FiscalKeyInfo {
  uf: string; // código IBGE da UF (2 dígitos)
  year: number; // ano da emissão (20YY)
  month: number; // mês da emissão (1-12)
  cnpj: string; // CNPJ do emitente (14 dígitos)
}

// Procura uma sequência "isolada" de exatamente 44 dígitos em um texto (chave solta ou dentro
// da URL do QR da NFC-e).
export function extractAccessKey(input: string | undefined | null): string | null {
  if (!input) return null;
  const match = input.match(/(?<!\d)\d{44}(?!\d)/);
  return match ? match[0] : null;
}

// Dígito verificador (mód. 11) sobre os 43 primeiros dígitos.
export function accessKeyCheckDigit(base43: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv >= 10 ? 0 : dv;
}

export function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/.test(key)) return false;
  return Number(key[43]) === accessKeyCheckDigit(key.slice(0, 43));
}

export function parseAccessKey(key: string): FiscalKeyInfo | null {
  if (!isValidAccessKey(key)) return null;
  return {
    uf: key.slice(0, 2),
    year: 2000 + Number(key.slice(2, 4)),
    month: Number(key.slice(4, 6)),
    cnpj: key.slice(6, 20),
  };
}
