import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  createKeepAwake,
  type KeepAwakeMode,
  keepAwakeWanted,
  parseKeepAwakeMode,
  type PowerSaveBlockerLike,
  readKeepAwakeMode
} from "../power-save";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";

const MAX_WORK_COUNT = 1000;

const activeWorkSchema = z.object({ count: z.number().int().min(0).max(MAX_WORK_COUNT) }).passthrough();

export interface PowerDeps {
  blocker: PowerSaveBlockerLike;
  /** Persisted keep-awake mode. */
  configFile: string;
  ipc: IpcLike;
  log: (line: string) => void;
  monitor: {
    isOnBatteryPower: () => boolean;
    on: (event: "on-ac" | "on-battery", listener: () => void) => unknown;
  };
  /** Push a message to every open window. */
  broadcast: (channel: string, payload: unknown) => void;
}

function readMode(file: string): KeepAwakeMode {
  try {
    return readKeepAwakeMode(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return "off";
  }
}

/**
 * Keep-awake follows the user's choice (off, while a turn is running, always) and the renderer's report of
 * turns in flight. Battery state is mirrored to the renderer so background polling can slow down.
 */
export function registerPowerFeatures(deps: PowerDeps) {
  const keepAwake = createKeepAwake(deps.blocker);
  let mode = readMode(deps.configFile);
  let working = false;
  let onBattery = false;

  const apply = () => keepAwake.set(keepAwakeWanted(mode, working));

  deps.ipc.on(CH.keepAwake, (_event, value: unknown) => {
    const next = parseKeepAwakeMode(value);

    if (next === null) {
      return;
    }

    mode = next;
    apply();

    try {
      mkdirSync(path.dirname(deps.configFile), { recursive: true });
      writeFileSync(deps.configFile, JSON.stringify({ mode }), "utf8");
    } catch (error) {
      deps.log(`[keep-awake] could not save the setting: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  deps.ipc.on(CH.activeWork, (_event, payload: unknown) => {
    const parsed = activeWorkSchema.safeParse(payload);

    if (parsed.success) {
      working = parsed.data.count > 0;
      apply();
    }
  });

  const setBattery = (next: boolean) => {
    if (next !== onBattery) {
      onBattery = next;
      deps.broadcast(CH.batteryChanged, next);
    }
  };

  deps.ipc.handle(CH.batteryGet, () => onBattery);
  deps.monitor.on("on-battery", () => setBattery(true));
  deps.monitor.on("on-ac", () => setBattery(false));
  onBattery = deps.monitor.isOnBatteryPower();
  apply();

  return { isWorking: () => working, keepAwakeActive: keepAwake.isActive, mode: () => mode };
}
