import { injectable } from "inversify";
import jsQR from "jsqr";
import { Jimp } from "jimp";
import { logger } from "../infra/logger";

// Decodifica o QR Code do cupom (NFC-e) a partir da imagem — fallback quando a IA não captura
// a chave de acesso no texto. Retorna o conteúdo do QR (URL da SEFAZ) ou null.
@injectable()
export class QrService {
  async decode(base64Image: string): Promise<string | null> {
    try {
      const buffer = Buffer.from(base64Image, "base64");
      const image = await Jimp.read(buffer);
      const { data, width, height } = image.bitmap;
      const result = jsQR(new Uint8ClampedArray(data), width, height);
      return result?.data ?? null;
    } catch (err) {
      logger.warn({ err }, "Falha ao decodificar o QR do cupom");
      return null;
    }
  }
}
