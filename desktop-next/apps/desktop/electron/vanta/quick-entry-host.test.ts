import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";
import { type QuickWindowLike, registerQuickEntry } from "./quick-entry-host";

const dirs: string[] = [];

afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true })));

const WORK_AREA = { height: 800, width: 1200, x: 0, y: 0 };

function setup(options: { shortcutTaken?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "vanta-quick-"));
  dirs.push(dir);
  const settingsFile = path.join(dir, "quick-entry.json");
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: (c, f) => handlers.set(c, f as never) } as IpcLike;

  const quickContents = { send: vi.fn() };
  const quickWindow: QuickWindowLike & { visible: boolean } = {
    focus: vi.fn(),
    hide: vi.fn(() => void (quickWindow.visible = false)),
    isDestroyed: () => false,
    isVisible: () => quickWindow.visible,
    setBounds: vi.fn(),
    show: vi.fn(() => void (quickWindow.visible = true)),
    visible: false,
    webContents: quickContents
  };

  const mainContents = { send: vi.fn() };
  const registered = new Map<string, () => void>();

  const globalShortcut = {
    isRegistered: (accelerator: string) => registered.has(accelerator) || Boolean(options.shortcutTaken),
    register: (accelerator: string, callback: () => void) => {
      registered.set(accelerator, callback);

      return true;
    },
    unregister: (accelerator: string) => void registered.delete(accelerator)
  };

  const openQuickWindow = vi.fn(() => quickWindow);
  const ensureMain = vi.fn(async () => ({ webContents: mainContents }));

  const host = registerQuickEntry({
    ensureMain,
    getMainContents: () => mainContents,
    globalShortcut,
    ipc,
    log: vi.fn(),
    openQuickWindow,
    settingsFile,
    workArea: () => WORK_AREA
  });

  const call = (channel: string, sender: unknown, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender }, ...args));

  return { call, ensureMain, host, mainContents, openQuickWindow, quickContents, quickWindow, registered, settingsFile };
}

describe("shortcut and settings", () => {
  it("registers the default Cmd/Ctrl+Shift+Space once applied, and a press opens the composer", () => {
    const { host, openQuickWindow, quickContents, quickWindow, registered } = setup();

    host.apply();
    registered.get("CommandOrControl+Shift+Space")!();

    expect(openQuickWindow).toHaveBeenCalledTimes(1);
    expect(quickWindow.setBounds).toHaveBeenCalledWith(expect.objectContaining({ height: 168, width: 640 }));
    expect(quickWindow.show).toHaveBeenCalled();
    expect(quickContents.send).toHaveBeenCalledWith(CH.quickShown);
  });

  it("reuses the window on later presses", () => {
    const { host, openQuickWindow, registered } = setup();

    host.apply();
    registered.get("CommandOrControl+Shift+Space")!();
    registered.get("CommandOrControl+Shift+Space")!();

    expect(openQuickWindow).toHaveBeenCalledTimes(1);
  });

  it("reports a shortcut another app already owns instead of failing silently", async () => {
    const { call, host } = setup({ shortcutTaken: true });

    host.apply();

    expect(await call(CH.quickSettingsGet, {})).toMatchObject({ enabled: true, error: "taken", registered: false });
  });

  it("saves a valid new shortcut, and falls back to the default for an invalid one", async () => {
    const { call, registered, settingsFile } = setup();

    const changed = await call(CH.quickSettingsSet, {}, { shortcut: "cmd+shift+k" });
    expect(changed).toMatchObject({ error: null, registered: true, shortcut: "Command+Shift+K" });
    expect(registered.has("Command+Shift+K")).toBe(true);
    expect(JSON.parse(readFileSync(settingsFile, "utf8")).shortcut).toBe("Command+Shift+K");

    const bad = await call(CH.quickSettingsSet, {}, { shortcut: "K" });
    expect(bad).toMatchObject({ shortcut: "CommandOrControl+Shift+Space" });
  });

  it("releases the shortcut when turned off, and ignores an unknown settings key", async () => {
    const { call, host, registered } = setup();

    host.apply();
    expect(registered.size).toBe(1);

    await call(CH.quickSettingsSet, {}, { enabled: false });
    expect(registered.size).toBe(0);

    await call(CH.quickSettingsSet, {}, { enabled: true, evil: "x" });
    expect(registered.size).toBe(0);
  });
});

describe("submit relay", () => {
  async function summon() {
    const ctx = setup();
    ctx.host.apply();
    ctx.registered.get("CommandOrControl+Shift+Space")!();

    return ctx;
  }

  it("forwards the text to the main window's own prompt pipeline and hides after the main window acknowledges", async () => {
    const { call, mainContents, quickWindow } = await summon();

    const pending = call(CH.quickSubmit, quickWindow.webContents, { target: "current", text: "  summarise the diff  " });
    await vi.waitFor(() => expect(mainContents.send).toHaveBeenCalled());
    const [channel, payload] = mainContents.send.mock.calls[0] as [string, { correlationId: string; target: string; text: string }];

    expect(channel).toBe(CH.quickSubmitToMain);
    expect(payload).toMatchObject({ target: "current", text: "summarise the diff" });

    await call(CH.quickAck, mainContents, { correlationId: payload.correlationId, result: { ok: true } });

    expect(await pending).toEqual({ ok: true });
    expect(quickWindow.hide).toHaveBeenCalled();
  });

  it("refuses a submit that does not come from the quick window", async () => {
    const { call, mainContents } = await summon();

    expect(await call(CH.quickSubmit, { other: true }, { target: "current", text: "hi" })).toMatchObject({ code: "refused", ok: false });
    expect(await call(CH.quickSubmit, mainContents, { target: "current", text: "hi" })).toMatchObject({ code: "refused", ok: false });
    expect(mainContents.send).not.toHaveBeenCalled();
  });

  it.each([
    ["empty text", { target: "current", text: "   " }],
    ["overlong text", { target: "current", text: "x".repeat(20_001) }],
    ["an extra key", { evil: 1, target: "current", text: "hi" }],
    ["a missing target", { text: "hi" }],
    ["no payload", undefined]
  ])("refuses %s", async (_label, payload) => {
    const { call, mainContents, quickWindow } = await summon();

    expect(await call(CH.quickSubmit, quickWindow.webContents, payload)).toMatchObject({ code: "refused", ok: false });
    expect(mainContents.send).not.toHaveBeenCalled();
  });

  it("only accepts an acknowledgement from the main window", async () => {
    const { call, mainContents, quickWindow } = await summon();

    const pending = call(CH.quickSubmit, quickWindow.webContents, { target: "current", text: "hi" });
    await vi.waitFor(() => expect(mainContents.send).toHaveBeenCalled());
    const id = (mainContents.send.mock.calls[0]?.[1] as { correlationId: string }).correlationId;

    await call(CH.quickAck, quickWindow.webContents, { correlationId: id, result: { ok: true } });
    await call(CH.quickAck, mainContents, { correlationId: id, result: "not an object" });
    expect(quickWindow.hide).not.toHaveBeenCalled();

    await call(CH.quickAck, mainContents, { correlationId: id, result: { message: "no", ok: false } });
    expect(await pending).toMatchObject({ ok: false });
  });

  it("opens the main window first when it is gone", async () => {
    const { call, ensureMain, quickWindow } = await summon();
    ensureMain.mockResolvedValueOnce(null);

    expect(await call(CH.quickSubmit, quickWindow.webContents, { target: "current", text: "hi" })).toMatchObject({ code: "no-window", ok: false });
  });
});

describe("state and dismiss", () => {
  it("passes the main window's state to the composer and replays it when summoned", async () => {
    const { call, host, mainContents, quickContents, registered } = setup();
    host.apply();
    const state = { connected: true, sessions: [{ id: "s1", title: "Fix the build" }] };

    await call(CH.quickState, mainContents, state);
    registered.get("CommandOrControl+Shift+Space")!();

    expect(quickContents.send).toHaveBeenCalledWith(CH.quickState, state);
  });

  it("ignores state from anywhere but the main window, and malformed state", async () => {
    const { call, host, mainContents, quickContents, registered } = setup();
    host.apply();
    registered.get("CommandOrControl+Shift+Space")!();
    quickContents.send.mockClear();

    await call(CH.quickState, { other: true }, { connected: true, sessions: [] });
    await call(CH.quickState, mainContents, { connected: "yes", sessions: [] });
    await call(CH.quickState, mainContents, { connected: true, sessions: Array.from({ length: 21 }, (_, i) => ({ id: String(i), title: "t" })) });

    expect(quickContents.send).not.toHaveBeenCalled();
  });

  it("hides on dismiss from the quick window only", async () => {
    const { call, host, mainContents, quickWindow, registered } = setup();
    host.apply();
    registered.get("CommandOrControl+Shift+Space")!();

    await call(CH.quickDismiss, mainContents);
    expect(quickWindow.hide).not.toHaveBeenCalled();
    await call(CH.quickDismiss, quickWindow.webContents);
    expect(quickWindow.hide).toHaveBeenCalledTimes(1);
  });

  it("mainReady resolves when the main window next reports its state", async () => {
    const { call, host, mainContents } = setup();
    const ready = host.mainReady();

    await call(CH.quickState, mainContents, { connected: true, sessions: [] });

    await expect(ready).resolves.toBeUndefined();
  });
});
