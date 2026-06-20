import { join, resolve } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { isInZone } from "./writable-zones.js";

// SCRATCHPAD — a dedicated temp workspace the agent may write into freely,
// without a per-file approval. It's a DESIGNATED writable zone (see
// writable-zones.ts), not a widening of scope: only this one directory is
// added. The path is stable across a project's sessions because it resolves
// under the global Vanta home (~/.vanta), independent of the current repo root.
//
// Resolution order:
//   1. VANTA_SCRATCHPAD_DIR — explicit override (absolute or relative)
//   2. <vanta-home>/scratch — default (honors VANTA_HOME, so tests isolate it)
const SCRATCH_SUBDIR = "scratch";

/** Resolve the agent scratchpad dir to a stable absolute path. */
export function scratchpadDir(env: NodeJS.ProcessEnv): string {
  const override = env.VANTA_SCRATCHPAD_DIR?.trim();
  if (override) return resolve(override);
  return join(resolveVantaHome(env), SCRATCH_SUBDIR);
}

/** True if `abs` (an absolute path) is inside the scratchpad dir. */
export function isInScratchpad(abs: string, env: NodeJS.ProcessEnv): boolean {
  return isInZone(resolve(abs), [scratchpadDir(env)]);
}

/** The mkdir surface ensureScratchpad needs — node:fs/promises `mkdir` fits. */
export type ScratchpadFs = {
  mkdir: (path: string, opts: { recursive: true }) => Promise<unknown>;
};

/**
 * Create the scratchpad dir (idempotent via recursive mkdir). Returns the path
 * on success, or an error value — never throws across the tool boundary.
 */
export async function ensureScratchpad(
  fs: ScratchpadFs,
  env: NodeJS.ProcessEnv,
): Promise<{ ok: true; dir: string } | { ok: false; error: string }> {
  const dir = scratchpadDir(env);
  try {
    await fs.mkdir(dir, { recursive: true });
    return { ok: true, dir };
  } catch (err) {
    return { ok: false, error: `could not create scratchpad ${dir}: ${(err as Error).message}` };
  }
}
