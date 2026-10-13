import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";

const fileSchema = z.object({ enabled: z.boolean() });
const setSchema = z.boolean();

export interface TraySettingDeps {
  /** Show or remove the tray. Called once at startup with the saved choice, then on every change. */
  apply: (enabled: boolean) => void;
  broadcast: (channel: string, payload: unknown) => void;
  file: string;
  ipc: IpcLike;
  log: (line: string) => void;
}

export interface TraySetting {
  isEnabled: () => boolean;
}

function readEnabled(file: string): boolean {
  try {
    const parsed = fileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));

    // On by default: it keeps the agent reachable after the window is closed, and the setting turns it off.
    return parsed.success ? parsed.data.enabled : true;
  } catch {
    return true;
  }
}

/** The "minimize to tray" setting: whether Vanta keeps a tray icon and keeps running after its window closes. */
export function registerTraySetting(deps: TraySettingDeps): TraySetting {
  let enabled = readEnabled(deps.file);
  const status = () => ({ available: true, enabled });

  deps.ipc.handle(CH.trayGet, () => status());

  deps.ipc.handle(CH.traySet, (_event, value: unknown) => {
    const parsed = setSchema.safeParse(value);

    if (parsed.success && parsed.data !== enabled) {
      enabled = parsed.data;
      deps.apply(enabled);
      deps.broadcast(CH.trayChanged, status());

      try {
        mkdirSync(path.dirname(deps.file), { recursive: true });
        writeFileSync(deps.file, JSON.stringify({ enabled }), "utf8");
      } catch (error) {
        deps.log(`[tray] could not save the setting: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return status();
  });

  deps.apply(enabled);

  return { isEnabled: () => enabled };
}
