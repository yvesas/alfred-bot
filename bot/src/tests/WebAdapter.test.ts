import "reflect-metadata";
import sinon from "sinon";
import { WebAdapter, WebOutbound } from "../platforms/web/WebAdapter";
import { BotCore } from "../core/BotCore";
import { IncomingMessage } from "../core/IncomingMessage";

describe("WebAdapter.processRaw", () => {
  let core: sinon.SinonStubbedInstance<BotCore>;
  let adapter: WebAdapter;
  let out: WebOutbound[];
  const send = (m: WebOutbound) => void out.push(m);

  beforeEach(() => {
    core = sinon.createStubInstance(BotCore);
    adapter = new WebAdapter(core);
    out = [];
  });

  it("processes a text message: typing on, bot replies, typing off", async () => {
    // O BotCore (mock) responde uma mensagem ao receber.
    core.handle.callsFake(async (_msg: IncomingMessage, reply) => {
      await reply.text("🛒 Compra registrada");
    });

    await adapter.processRaw(
      JSON.stringify({ type: "user_message", clientId: "c1", text: "agua 7" }),
      send,
    );

    expect(out[0]).toEqual({ type: "typing", value: true });
    expect(out).toContainEqual({ type: "bot_message", text: "🛒 Compra registrada" });
    expect(out[out.length - 1]).toEqual({ type: "typing", value: false });

    // A mensagem normalizada deve ter platform "web" e o clientId como externalId.
    const incoming = core.handle.firstCall.args[0];
    expect(incoming.platform).toBe("web");
    expect(incoming.externalId).toBe("c1");
    expect(incoming.kind).toBe("text");
  });

  it("routes known commands as 'command'", async () => {
    core.handle.resolves();

    await adapter.processRaw(
      JSON.stringify({ type: "user_message", clientId: "c1", text: "/gastos" }),
      send,
    );

    const incoming = core.handle.firstCall.args[0];
    expect(incoming.kind).toBe("command");
    expect(incoming.command?.name).toBe("gastos");
  });

  it("rejects invalid JSON", async () => {
    await adapter.processRaw("{ not json", send);
    expect(out).toEqual([{ type: "error", message: "Mensagem inválida (JSON)." }]);
    expect(core.handle.called).toBe(false);
  });

  it("rejects a message without clientId", async () => {
    await adapter.processRaw(JSON.stringify({ type: "user_message", text: "oi" }), send);
    expect(out[0].type).toBe("error");
    expect(core.handle.called).toBe(false);
  });
});
