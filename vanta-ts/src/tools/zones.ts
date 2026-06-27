import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { scratchpadDir } from "./scratchpad.js";

// Path zones — directories outside the project root that the file tools may touch,
// each still kernel-gated (the kernel returns Ask for any out-of-root path). The
// zone allowlist is the BACKSTOP that bounds where an approved access can land, so
// the agent can't be talked into write_file ~/.ssh/authorized_keys by reflex.
//
//   write_file → WRITABLE zones (narrow: where new files may land)
//   read_file  → READABLE zones (broader: reads don't mutate; default includes the
//                project's parent so sibling repos in the same workspace are readable)
//
// Override with VANTA_WRITABLE_DIRS / VANTA_READABLE_DIRS (comma-separated; replaces
// the defaults). `~` expands to home.

const DEFAULT_WRITABLE = ["~/Desktop", "~/Downloads"] as const;

/** Expand a leading `~` to the user's home dir. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

function parseDirs(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => resolve(expandHome(s)));
}

/**
 * Resolve the configured writable zones to absolute dir paths. The agent's
 * scratchpad (a designated temp workspace, see scratchpad.ts) is ALWAYS a
 * writable zone — even when VANTA_WRITABLE_DIRS replaces the defaults — so the
 * agent can write temp files there without a per-file approval. It's one
 * directory, never a widening of scope.
 */
export function resolveWritableZones(env: NodeJS.ProcessEnv): string[] {
  const raw = env.VANTA_WRITABLE_DIRS?.trim();
  const base = raw ? parseDirs(raw) : [...DEFAULT_WRITABLE].map((s) => resolve(expandHome(s)));
  const extra = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  return [...base, ...extra, scratchpadDir(env)];
}

/**
 * Resolve the configured readable zones. Default = the project's PARENT dir (so
 * sibling repos in the same workspace, e.g. ~/Documents/GitHub/theft-kit, are
 * readable) plus the writable zones. Reads are kernel-Asked per out-of-root path.
 */
export function resolveReadableZones(env: NodeJS.ProcessEnv, root: string): string[] {
  const raw = env.VANTA_READABLE_DIRS?.trim();
  const base = raw ? parseDirs(raw) : [dirname(resolve(root)), ...resolveWritableZones(env)];
  const extra = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  return [...base, ...extra];
}

/**
 * Add a directory to the session's extra dirs (readable + writable).
 * Mutates process.env.VANTA_EXTRA_DIRS. The kernel still gates each access.
 */
export function addSessionDir(dir: string, env: NodeJS.ProcessEnv): void {
  const abs = resolve(expandHome(dir));
  const current = env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
  if (!current.includes(abs)) {
    env.VANTA_EXTRA_DIRS = [...current, abs].join(",");
  }
}

/** List currently active extra session dirs. */
export function getSessionDirs(env: NodeJS.ProcessEnv): string[] {
  return env.VANTA_EXTRA_DIRS?.trim() ? parseDirs(env.VANTA_EXTRA_DIRS) : [];
}

/** True if `abs` (an absolute path) is inside one of the zones. */
export function isInZone(abs: string, zones: string[]): boolean {
  return zones.some((z) => abs === z || abs.startsWith(z + sep));
}
