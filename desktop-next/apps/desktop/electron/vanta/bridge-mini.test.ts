import { describe, expect, it } from "vitest";

import { DEFAULT_HUD_WINDOWING } from "./bridge-mini";
import { buildHermesDesktop } from "./bridge-surface";
import { env, fakeIpc } from "./bridge-test-helpers";
import { CH } from "./channels";

describe("mini window, quick entry and tray members", () => {
  it("sends HUD controls to the main process and keeps the game overlay unsupported", async () => {
    const { invoked, ipc, sent } = fakeIpc({ ok: true });
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;

    await desktop.hud.open({ sessionId: "s1" });
    await desktop.hud.close();
    await desktop.hud.setFrost(true);
    desktop.hud.setBounds({ height: 200, width: 400, x: 1, y: 2 });
    desktop.hud.setSession("s1");

    expect(invoked.map(call => call[0])).toEqual([CH.hudOpen, CH.hudClose, CH.hudFrost]);
    expect(sent).toEqual([
      [CH.hudSetBounds, { height: 200, width: 400, x: 1, y: 2 }],
      [CH.hudSession, "s1"]
    ]);
    expect(desktop.hud.windowing).toEqual(DEFAULT_HUD_WINDOWING);
    expect(desktop.hud.onGameOverlay(() => undefined)()).toBeUndefined();
  });

  it("reports the windowing view main gave the preload", () => {
    const desktop = buildHermesDesktop({ ...env(fakeIpc().ipc), hudWindowing: { ...DEFAULT_HUD_WINDOWING, nativeDrag: true } }) as Record<string, any>;

    expect(desktop.hud.nativeDrag).toBe(true);
    expect(desktop.hud.windowing.nativeDrag).toBe(true);
  });

  it("routes quick entry in both directions", async () => {
    const { emit, invoked, ipc, sent } = fakeIpc({ ok: true });
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;
    const seen: unknown[] = [];

    await desktop.quickEntry.submit({ target: "current", text: "hi" });
    await desktop.quickEntry.getSettings();
    desktop.quickEntry.ackSubmit("c1", { ok: true });
    desktop.quickEntry.dismiss();
    desktop.quickEntry.pushState({ connected: true, sessions: [] });
    desktop.quickEntry.onSubmit((payload: unknown) => seen.push(payload));
    emit(CH.quickSubmitToMain, { correlationId: "c1", target: "current", text: "hi" });

    expect(invoked.map(call => call[0])).toEqual([CH.quickSubmit, CH.quickSettingsGet]);
    expect(sent).toEqual([
      [CH.quickAck, { correlationId: "c1", result: { ok: true } }],
      [CH.quickDismiss],
      [CH.quickState, { connected: true, sessions: [] }]
    ]);
    expect(seen).toEqual([{ correlationId: "c1", target: "current", text: "hi" }]);
  });

  it("reads and sets the tray preference", async () => {
    const { invoked, ipc } = fakeIpc({ available: true, enabled: true });
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;

    await desktop.minimizeToTray.get();
    await desktop.minimizeToTray.set(false);

    expect(invoked).toEqual([[CH.trayGet], [CH.traySet, false]]);
  });
});
