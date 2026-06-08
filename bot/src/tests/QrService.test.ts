import "reflect-metadata";
import { QrService } from "../services/QrService";

describe("QrService", () => {
  it("retorna null para uma imagem inválida (sem lançar)", async () => {
    const svc = new QrService();
    expect(await svc.decode("isto-nao-e-uma-imagem")).toBeNull();
  });
});
