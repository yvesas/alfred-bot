import "reflect-metadata";
import { assertProductionOrigins } from "../infra/config";

// C7 — o default de origem é "*", que é conveniente em dev e uma falha ABERTA em
// produção: esquecer a variável libera o WebSocket e a API para qualquer site.
// Estes testes garantem que o esquecimento vira erro no startup.

const prod = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: "production", ...extra }) as NodeJS.ProcessEnv;

describe("assertProductionOrigins", () => {
  it("não interfere fora de produção", () => {
    expect(() =>
      assertProductionOrigins({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() => assertProductionOrigins({} as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("lança em produção quando as duas origens faltam", () => {
    expect(() => assertProductionOrigins(prod())).toThrow(/WEB_ALLOWED_ORIGIN/);
    expect(() => assertProductionOrigins(prod())).toThrow(/WEB_APP_URL/);
  });

  it('trata "*" explícito como ausência — é o mesmo buraco', () => {
    expect(() =>
      assertProductionOrigins(prod({ WEB_ALLOWED_ORIGIN: "*", WEB_APP_URL: "*" })),
    ).toThrow(/WEB_ALLOWED_ORIGIN/);
  });

  it("aponta só a que falta", () => {
    expect(() =>
      assertProductionOrigins(prod({ WEB_ALLOWED_ORIGIN: "https://app.alfred.com.br" })),
    ).toThrow(/WEB_APP_URL/);
  });

  it("aceita produção com as duas origens explícitas", () => {
    expect(() =>
      assertProductionOrigins(
        prod({
          WEB_ALLOWED_ORIGIN: "https://app.alfred.com.br,https://alfred.com.br",
          WEB_APP_URL: "https://app.alfred.com.br",
        }),
      ),
    ).not.toThrow();
  });
});
