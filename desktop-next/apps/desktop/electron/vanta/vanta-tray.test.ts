import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";

import { buildTrayMenuTemplate, createTrayHost, OFFLINE, readTrayState, type TrayActions, type TrayState } from "./vanta-tray";

const actions = (): TrayActions => ({ quit: vi.fn(), showQuickEntry: vi.fn(), showVanta: vi.fn(), toggleMini: vi.fn() });
const labels = (template: MenuItemConstructorOptions[]) => template.map(item => item.label ?? item.type);

describe("tray menu", () => {
  it("has Show Vanta, Needs you (n) and Quit, plus the quick surfaces", () => {
    expect(labels(buildTrayMenuTemplate({ needsYou: 2, online: true }, actions(), false))).toEqual([
      "Vanta · online",
      "Show Vanta",
      "Needs you (2)",
      "separator",
      "Quick Entry…",
      "Open mini window",
      "separator",
      "Quit Vanta"
    ]);
  });

  it("disables 'Needs you' at zero and says offline when the server is down", () => {
    const menu = buildTrayMenuTemplate(OFFLINE, actions(), true);

    expect(menu.find(item => item.label === "Needs you (0)")?.enabled).toBe(false);
    expect(menu[0]?.label).toBe("Vanta · offline");
    expect(menu.some(item => item.label === "Close mini window")).toBe(true);
  });

  it("wires every entry to its action", () => {
    const a = actions();
    const menu = buildTrayMenuTemplate({ needsYou: 1, online: true }, a, false);
    const click = (label: string) => (menu.find(item => item.label === label)?.click as () => void)();

    click("Show Vanta");
    click("Needs you (1)");
    click("Quick Entry…");
    click("Open mini window");
    click("Quit Vanta");

    expect(a.showVanta).toHaveBeenCalledTimes(2);
    expect(a.showQuickEntry).toHaveBeenCalledTimes(1);
    expect(a.toggleMini).toHaveBeenCalledTimes(1);
    expect(a.quit).toHaveBeenCalledTimes(1);
  });
});

describe("readTrayState", () => {
  it("counts a pending approval as one thing needing the user", async () => {
    expect(await readTrayState(async () => ({ data: { id: "a1" }, ok: true }))).toEqual({ needsYou: 1, online: true });
    expect(await readTrayState(async () => ({ data: null, ok: true }))).toEqual({ needsYou: 0, online: true });
  });

  it("is offline when the server answers an error or cannot be reached", async () => {
    expect(await readTrayState(async () => ({ data: null, ok: false }))).toEqual(OFFLINE);
    expect(await readTrayState(async () => Promise.reject(new Error("down")))).toEqual(OFFLINE);
  });
});

describe("tray host", () => {
  function setup(initial: TrayState = OFFLINE) {
    let tick: () => void = () => undefined;
    const answer = { state: initial };
    const tray = { destroy: vi.fn(), on: vi.fn(), setContextMenu: vi.fn(), setToolTip: vi.fn() };
    const setBadge = vi.fn();
    const clearTimer = vi.fn();

    const host = createTrayHost({
      actions: actions(),
      buildMenu: template => template,
      clearTimer,
      createTray: () => tray,
      isMiniOpen: () => false,
      poll: async () => answer.state,
      setBadge,
      startTimer: run => {
        tick = run;

        return 1;
      }
    });

    return { answer, clearTimer, host, setBadge, tick: () => tick(), tray };
  }

  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it("shows the waiting count as the tooltip and badge, and clears them when it drops", async () => {
    const { answer, setBadge, tick, tray } = setup({ needsYou: 2, online: true });

    await settle();
    expect(tray.setToolTip).toHaveBeenLastCalledWith("Vanta needs you (2)");
    expect(setBadge).toHaveBeenLastCalledWith("2");

    answer.state = { needsYou: 0, online: true };
    tick();
    await settle();
    expect(tray.setToolTip).toHaveBeenLastCalledWith("Vanta");
    expect(setBadge).toHaveBeenLastCalledWith("");
  });

  it("only rebuilds the menu when something changed", async () => {
    const { host, tray } = setup({ needsYou: 1, online: true });

    await settle();
    const afterFirst = tray.setContextMenu.mock.calls.length;
    await host.refresh();
    await host.refresh();

    expect(tray.setContextMenu.mock.calls.length).toBe(afterFirst);
  });

  it("opens the main window on click, and dispose removes the tray, the timer and the badge", () => {
    const { clearTimer, host, setBadge, tray } = setup();

    expect(tray.on).toHaveBeenCalledWith("click", expect.any(Function));
    host.dispose();

    expect(tray.destroy).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledWith(1);
    expect(setBadge).toHaveBeenLastCalledWith("");
  });

  it("does nothing after dispose", async () => {
    const { answer, host, tray } = setup();

    host.dispose();
    answer.state = { needsYou: 3, online: true };
    const before = tray.setContextMenu.mock.calls.length;
    await host.refresh();

    expect(tray.setContextMenu.mock.calls.length).toBe(before);
  });
});
