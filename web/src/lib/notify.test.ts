import { describe, it, expect, vi, afterEach } from "vitest";
import { notifyIfHidden, requestNotificationPermission } from "./notify";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notify", () => {
  it("não lança quando Notification não existe no ambiente", () => {
    vi.stubGlobal("Notification", undefined);
    expect(() => notifyIfHidden("t", "b")).not.toThrow();
    expect(() => requestNotificationPermission()).not.toThrow();
  });

  it("não notifica quando a permissão não foi concedida", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "denied" }));
    notifyIfHidden("t", "b");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("notifica quando concedida e a aba está oculta", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "granted" }));
    vi.stubGlobal("document", { visibilityState: "hidden" });
    notifyIfHidden("Alfred", "🔔 Lembrete");
    expect(ctor).toHaveBeenCalledWith("Alfred", { body: "🔔 Lembrete" });
  });

  it("não notifica quando a aba está visível (a UI já mostra)", () => {
    const ctor = vi.fn();
    vi.stubGlobal("Notification", Object.assign(ctor, { permission: "granted" }));
    vi.stubGlobal("document", { visibilityState: "visible" });
    notifyIfHidden("Alfred", "msg");
    expect(ctor).not.toHaveBeenCalled();
  });
});
