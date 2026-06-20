import { checkForUpdate } from "../update/version-check.js";
import type { CheckForUpdateDeps } from "../update/version-check.js";

// VANTA-AUTO-UPDATER — `vanta update` surface.
//
// Prints the "update available" notice (or "up to date") and the upgrade
// command — it NEVER runs the upgrade itself. Auto-updating is opt-in by
// design: a trusted-operator agent doesn't mutate its own install without an
// explicit human step. NOT wired into cli.ts here; that wiring is a separate
// slice. `handleUpdate` is pure over its injected deps + sink.

/** The command we print for the operator to run by hand. Never auto-executed. */
export const UPGRADE_COMMAND = "npm install -g vanta@latest";

/** Injected deps for {@link handleUpdate}: the check deps + an output sink. */
export type HandleUpdateDeps = CheckForUpdateDeps & {
  /** Output sink (defaults to console.log at the call site, never here). */
  log: (line: string) => void;
};

/**
 * Run one update check and print the result. Returns an exit code:
 * 0 always (an available update is informational, not a failure).
 * Prints the notice + upgrade command when an update exists, else "up to date".
 */
export async function handleUpdate(deps: HandleUpdateDeps): Promise<number> {
  const { log } = deps;
  const result = await checkForUpdate(deps);
  if (result.available && result.notice) {
    log(result.notice);
    log(`  To upgrade: ${UPGRADE_COMMAND}`);
    return 0;
  }
  log(`vanta ${deps.currentVersion} is up to date.`);
  return 0;
}

/** Read this package's version from package.json. Best-effort, never throws. */
async function readPackageVersion(): Promise<string> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { join, dirname } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    // src/cli/ → ../../package.json
    const pkgPath = join(here, "..", "..", "package.json");
    const parsed: unknown = JSON.parse(await readFile(pkgPath, "utf8"));
    const v = (parsed as { version?: unknown })?.version;
    return typeof v === "string" ? v : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Fetch the latest published version from the npm registry. The live network
 * boundary — injected into the pure core, and itself fails closed (returns
 * null on any error so the check degrades to "no update", never a false claim).
 */
async function fetchLatestFromNpm(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/vanta/latest", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const v = (body as { version?: unknown })?.version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/**
 * `vanta update` entry point. Resolves the current + latest versions live, then
 * delegates to the pure {@link handleUpdate}. `rest` is reserved for future
 * flags; unknown args are ignored (the command is read-only/informational).
 */
export async function runUpdateCommand(_rest: string[] = []): Promise<number> {
  const currentVersion = await readPackageVersion();
  return handleUpdate({
    currentVersion,
    fetchLatest: fetchLatestFromNpm,
    log: (line) => console.log(line),
  });
}
