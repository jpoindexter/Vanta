import { join } from "node:path";
import { fireHooks } from "../hooks/shell-hooks.js";

export type LifecycleFlags = {
  init: boolean;
  initOnly: boolean;
  maintenance: boolean;
};

export type LifecycleParse = {
  flags: LifecycleFlags;
  rest: string[];
};

const INIT_FLAGS = new Set(["--init", "--init-only", "--maintenance"]);

export function parseLifecycleFlags(args: string[]): LifecycleParse {
  const flags: LifecycleFlags = { init: false, initOnly: false, maintenance: false };
  const rest: string[] = [];
  for (const arg of args) {
    if (!INIT_FLAGS.has(arg)) {
      rest.push(arg);
      continue;
    }
    if (arg === "--init") flags.init = true;
    if (arg === "--init-only") flags.initOnly = true;
    if (arg === "--maintenance") flags.maintenance = true;
  }
  if (flags.initOnly || flags.maintenance) flags.init = true;
  if (flags.maintenance) flags.initOnly = true;
  return { flags, rest };
}

export async function runLifecycleHooks(
  repoRoot: string,
  flags: LifecycleFlags,
  sessionType: "interactive" | "one-shot",
): Promise<boolean> {
  if (!flags.init) return false;
  const dataDir = join(repoRoot, ".vanta");
  const context = { sessionType, maintenance: flags.maintenance };
  await fireHooks(dataDir, "Setup", context, { cwd: repoRoot, sessionType, maintenance: flags.maintenance });
  if (flags.initOnly) {
    await fireHooks(dataDir, "SessionStart", context, { cwd: repoRoot, sessionType, maintenance: flags.maintenance });
    return true;
  }
  return false;
}
