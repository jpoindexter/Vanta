import { mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Cron fire CAS — the cross-process at-most-once backstop for the cron ledger.
 *
 * `at-most-once.ts` dedups fires WITHIN one process (a read-decide-persist of
 * `cron-fired.json`). But two overlapping PROCESSES — the gateway tick and a
 * manual `vanta cron run`, or a launchd double-invocation — both read the map
 * as "not fired", both decide to fire, and the naive last-writer-wins persist
 * can't stop the double-run. This is the store-CAS that closes that race: an
 * atomic exclusive-create claim per `(taskId, windowKey)`, so exactly one
 * process wins the claim and the rest skip. Same O_EXCL primitive as
 * `team/checkout.ts`, but a fire claim is NEVER released — it stays for the
 * window (that IS the at-most-once guarantee); old windows are swept instead.
 *
 * Fail-soft direction: on a non-EEXIST I/O error the claim SUCCEEDS (returns
 * true → the task fires). A broken filesystem then degrades to exactly today's
 * in-process-only behavior (at worst one extra fire across processes — never a
 * silently-dropped due fire). EEXIST — the real race signal — returns false.
 */

const CLAIMS_DIR = "cron-claims";

/** Filesystem-safe claim path for one `(taskId, windowKey)` pair. */
export function claimPath(dataDir: string, taskId: string | number, windowKey: string): string {
  const safe = `${String(taskId)}__${windowKey}`.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  return join(dataDir, CLAIMS_DIR, `${safe}.claim`);
}

/**
 * Atomically claim the fire of `taskId` for `windowKey`. Returns true iff THIS
 * caller won the claim (created the file); false if another process already
 * holds it (EEXIST). On any other I/O error, returns true (fail-soft toward
 * firing — see the module note).
 */
export async function claimFire(
  dataDir: string,
  taskId: string | number,
  windowKey: string,
): Promise<boolean> {
  const path = claimPath(dataDir, taskId, windowKey);
  try {
    await mkdir(join(dataDir, CLAIMS_DIR), { recursive: true });
    await writeFile(path, windowKey, { flag: "wx" });
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "EEXIST";
  }
}

/** Whether a claim filename belongs to a window other than `keepWindowKey`. */
function isStaleClaim(name: string, keepWindowKey: string): boolean {
  return name.endsWith(".claim") && !name.endsWith(`__${keepWindowKey}.claim`);
}

/**
 * Prune claim files from every window except `keepWindowKey`, so the claims dir
 * doesn't grow unbounded (one file per due task per minute). Best-effort: a
 * missing dir or unlink failure is swallowed — sweeping is housekeeping, never
 * a reason to break a tick. Returns the count removed.
 */
export async function sweepClaims(dataDir: string, keepWindowKey: string): Promise<number> {
  const dir = join(dataDir, CLAIMS_DIR);
  let removed = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!isStaleClaim(name, keepWindowKey)) continue;
    try {
      await rm(join(dir, name), { force: true });
      removed += 1;
    } catch {
      /* housekeeping only */
    }
  }
  return removed;
}
