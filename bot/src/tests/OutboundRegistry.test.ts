import "reflect-metadata";
import { OutboundRegistry, OutboundSender } from "../core/OutboundRegistry";

describe("OutboundRegistry", () => {
  let registry: OutboundRegistry;

  beforeEach(() => {
    registry = new OutboundRegistry();
  });

  it("entrega para o sender registrado da plataforma", async () => {
    const calls: string[] = [];
    const sender: OutboundSender = {
      sendTo: async (externalId, text) => {
        calls.push(`${externalId}:${text}`);
        return true;
      },
    };
    registry.register("telegram", sender);

    expect(await registry.send("telegram", "1", "oi")).toBe(true);
    expect(calls).toEqual(["1:oi"]);
  });

  it("retorna false quando não há sender para a plataforma", async () => {
    expect(await registry.send("whatsapp", "1", "oi")).toBe(false);
  });

  it("não propaga erro do sender (retorna false)", async () => {
    registry.register("web", {
      sendTo: async () => {
        throw new Error("boom");
      },
    });
    expect(await registry.send("web", "1", "oi")).toBe(false);
  });
});
