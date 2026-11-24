import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";
import { registerPowerFeatures } from "./power-features";

const dirs: string[] = [];

afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { force: true, recursive: true })));

function setup(initial?: unknown, battery = false) {
  const dir = mkdtempSync(path.join(tmpdir(), "vanta-power-"));
  dirs.push(dir);
  const configFile = path.join(dir, "keep-awake.json");

  if (initial !== undefined) {
    writeFileSync(configFile, JSON.stringify(initial));
  }

  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: (c, f) => handlers.set(c, f as never) } as IpcLike;
  const started = new Set<number>();
  let next = 1;

  const blocker = {
    isStarted: (id: number) => started.has(id),
    start: () => {
      started.add(next);

      return next++;
    },
    stop: (id: number) => void started.delete(id)
  };

  const monitorHandlers = new Map<string, () => void>();
  const broadcast = vi.fn();

  const power = registerPowerFeatures({
    blocker,
    broadcast,
    configFile,
    ipc,
    log: vi.fn(),
    monitor: { isOnBatteryPower: () => battery, on: (event, fn) => monitorHandlers.set(event, fn) }
  });

  const send = (channel: string, value: unknown) => handlers.get(channel)!({ sender: {} }, value);

  return { broadcast, configFile, handlers, monitorHandlers, power, send, started };
}

describe("keep awake", () => {
  it("holds the machine awake only while a turn runs in 'while-working' mode", () => {
    const { power, send, started } = setup();

    send(CH.keepAwake, "while-working");
    expect(started.size).toBe(0);

    send(CH.activeWork, { count: 1, titles: ["a"] });
    expect(power.keepAwakeActive()).toBe(true);

    send(CH.activeWork, { count: 0, titles: [] });
    expect(power.keepAwakeActive()).toBe(false);
  });

  it("holds always in 'always' mode and releases when turned off", () => {
    const { power, send } = setup();

    send(CH.keepAwake, "always");
    expect(power.keepAwakeActive()).toBe(true);
    send(CH.keepAwake, "off");
    expect(power.keepAwakeActive()).toBe(false);
  });

  it("accepts the legacy boolean and saves the mode so a relaunch restores it", () => {
    const { configFile, send } = setup();

    send(CH.keepAwake, true);

    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({ mode: "always" });
    expect(setup({ mode: "always" }).power.keepAwakeActive()).toBe(true);
  });

  it.each(["forever", 5, null, undefined, {}, ["always"]])("ignores the invalid mode %j", value => {
    const { power, send } = setup();

    send(CH.keepAwake, value);

    expect(power.mode()).toBe("off");
    expect(power.keepAwakeActive()).toBe(false);
  });

  it.each([{ count: -1 }, { count: 1.5 }, { count: 99_999 }, { count: "3" }, null, "x", {}])("ignores the invalid work report %j", payload => {
    const { power, send } = setup({ mode: "while-working" });

    send(CH.activeWork, payload);

    expect(power.isWorking()).toBe(false);
  });

  it("starts off when the saved file is missing or corrupt", () => {
    const { configFile } = setup();
    writeFileSync(configFile, "{{{");

    expect(setup().power.mode()).toBe("off");
  });
});

describe("battery", () => {
  it("answers the current state and broadcasts a change once", async () => {
    const { broadcast, handlers, monitorHandlers } = setup(undefined, true);

    expect(await handlers.get(CH.batteryGet)!({ sender: {} })).toBe(true);

    monitorHandlers.get("on-ac")!();
    monitorHandlers.get("on-ac")!();
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(CH.batteryChanged, false);

    monitorHandlers.get("on-battery")!();
    expect(broadcast).toHaveBeenLastCalledWith(CH.batteryChanged, true);
  });
});
