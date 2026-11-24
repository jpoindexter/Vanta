import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";
import { registerTraySetting } from "./tray-setting";

const dirs: string[] = [];

afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true })));

function setup(saved?: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "vanta-tray-"));
  dirs.push(dir);
  const file = path.join(dir, "tray.json");

  if (saved !== undefined) {
    writeFileSync(file, typeof saved === "string" ? saved : JSON.stringify(saved));
  }

  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
  const apply = vi.fn();
  const broadcast = vi.fn();
  const setting = registerTraySetting({ apply, broadcast, file, ipc, log: vi.fn() });
  const call = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args));

  return { apply, broadcast, call, file, setting };
}

describe("minimize to tray setting", () => {
  it("is on by default and applies that at startup", async () => {
    const { apply, call, setting } = setup();

    expect(setting.isEnabled()).toBe(true);
    expect(apply).toHaveBeenCalledWith(true);
    expect(await call(CH.trayGet)).toEqual({ available: true, enabled: true });
  });

  it("reads a saved 'off', and treats a corrupt or odd file as the default", () => {
    expect(setup({ enabled: false }).setting.isEnabled()).toBe(false);
    expect(setup("{{").setting.isEnabled()).toBe(true);
    expect(setup({ enabled: "no" }).setting.isEnabled()).toBe(true);
  });

  it("turning it off removes the tray, saves the choice and tells every window", async () => {
    const { apply, broadcast, call, file } = setup();

    expect(await call(CH.traySet, false)).toEqual({ available: true, enabled: false });

    expect(apply).toHaveBeenLastCalledWith(false);
    expect(broadcast).toHaveBeenCalledWith(CH.trayChanged, { available: true, enabled: false });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ enabled: false });
  });

  it("ignores a value that is not a boolean, and a repeat of the current value", async () => {
    const { apply, broadcast, call } = setup();
    apply.mockClear();

    for (const bad of ["false", 0, null, undefined, {}]) {
      expect(await call(CH.traySet, bad)).toEqual({ available: true, enabled: true });
    }

    await call(CH.traySet, true);
    expect(apply).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
