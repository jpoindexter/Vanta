import { loadSettings } from "../settings/store.js";
import {
  DEFAULT_AUTO_MODE_CONFIG,
  formatAutoModeConfig,
  isAutoModeEnabled,
  resolveAutoModeConfig,
} from "../permissions/auto-mode.js";

export type AutoModeCommandDeps = {
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
};

function usage(log: (line: string) => void): number {
  log("usage: vanta auto-mode [defaults|config]");
  return 1;
}

export async function runAutoModeCommand(
  root: string,
  rest: string[],
  deps: AutoModeCommandDeps = {},
): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const sub = rest[0] ?? "config";
  if (sub === "defaults") {
    log(formatAutoModeConfig(DEFAULT_AUTO_MODE_CONFIG, "defaults"));
    return 0;
  }
  if (sub !== "config") return usage(log);

  const settings = await loadSettings(root, env);
  log(`enabled ${isAutoModeEnabled(env, settings) ? "yes" : "no"}`);
  log(formatAutoModeConfig(resolveAutoModeConfig(settings), "effective"));
  return 0;
}
