import { describe, expect, it } from "vitest";

import { buildHermesDesktop } from "./bridge-surface";
import { env, fakeIpc } from "./bridge-test-helpers";
import { CH } from "./channels";

describe("window-feature members", () => {
  it("sends find, keep-awake and active-work to the main process", async () => {
    const { invoked, ipc, sent } = fakeIpc({ count: 0 });
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;

    await desktop.findInPage("needle", { forward: true });
    await desktop.stopFindInPage();
    await desktop.getOnBattery();
    await desktop.signalDeepLinkReady();
    desktop.setKeepAwake("while-working");
    desktop.setActiveWork({ count: 2, titles: ["a", "b"] });

    expect(invoked.map(call => call[0])).toEqual([CH.findInPage, CH.stopFindInPage, CH.batteryGet, CH.deepLinkReady]);
    expect(sent).toEqual([
      [CH.keepAwake, "while-working"],
      [CH.activeWork, { count: 2, titles: ["a", "b"] }]
    ]);
  });

  it("delivers pushes from the main process and lets the caller unsubscribe", () => {
    const { emit, ipc, listenerCount } = fakeIpc();
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;
    const seen: unknown[] = [];

    const off = desktop.onFoundInPage((result: unknown) => seen.push(result));
    desktop.onBatteryChanged((value: unknown) => seen.push(value));
    desktop.onDeepLink((link: unknown) => seen.push(link));
    desktop.onOpenFolderRequested(() => seen.push("folder"));

    emit(CH.foundInPage, { activeMatchOrdinal: 2, count: 5 });
    emit(CH.batteryChanged, true);
    emit(CH.deepLink, { kind: "blueprint", name: "x", params: {} });
    emit(CH.openFolderRequested);
    off();
    emit(CH.foundInPage, { activeMatchOrdinal: 9, count: 9 });

    expect(seen).toEqual([{ activeMatchOrdinal: 2, count: 5 }, true, { kind: "blueprint", name: "x", params: {} }, "folder"]);
    expect(listenerCount(CH.foundInPage)).toBe(0);
  });

  it("tells the settings control when the main process changes zoom", () => {
    const { emit, ipc } = fakeIpc();
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;
    const seen: unknown[] = [];

    desktop.zoom.onChanged((payload: unknown) => seen.push(payload));
    emit(CH.zoomChanged);

    expect(seen).toEqual([{ level: 1, percent: 125 }]);
  });
});
