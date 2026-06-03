import { homedir } from "node:os";
import { resolve, sep } from "node:path";

// Writable zones — directories outside the project root that write_file may write
// to, each still kernel-gated (the kernel returns Ask for any out-of-root path, so
// the human approves every such write). The zone allowlist is the BACKSTOP: it
// bounds where an approved write can land, so the agent can't be talked into
// writing ~/.ssh/authorized_keys even if a prompt is approved by reflex.
//
// Default zones are the common "give me a file" destinations. Override with
// ARGO_WRITABLE_DIRS (comma-separated; replaces the defaults). `~` expands to home.

const DEFAULT_ZONES = ["~/Desktop", "~/Downloads"] as const;

/** Expand a leading `~` to the user's home dir. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

/** Resolve the configured writable zones to absolute dir paths. */
export function resolveWritableZones(env: NodeJS.ProcessEnv): string[] {
  const raw = env.ARGO_WRITABLE_DIRS?.trim();
  const specs = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [...DEFAULT_ZONES];
  return specs.map((s) => resolve(expandHome(s)));
}

/** True if `abs` (an absolute path) is inside one of the writable zones. */
export function isInWritableZone(abs: string, zones: string[]): boolean {
  return zones.some((z) => abs === z || abs.startsWith(z + sep));
}
