import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { kernelRunDir } from "./pid-file.js";
import { isProcessAlive } from "./process-ops.js";

/**
 * A lock older than this is stale even if its pid is alive (pid reuse): a real holder owns it only for
 * the kernel start window, which is bounded by the readiness timeout.
 */
export const SPAWN_LOCK_MAX_AGE_MS = 120_000;
const ACQUIRE_ATTEMPTS = 3;

const SpawnLockSchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  token: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  startedAt: z.string().min(1),
});
type SpawnLock = z.infer<typeof SpawnLockSchema>;

export type SpawnLockResult =
  | { kind: "acquired"; release: () => void }
  | { kind: "held"; holderPid: number; startedAt: string };

export type SpawnLockDeps = {
  isAlive: (pid: number) => boolean;
  now: () => number;
  pid: number;
};

const defaultDeps: SpawnLockDeps = { isAlive: isProcessAlive, now: Date.now, pid: process.pid };

export function kernelSpawnLockPath(vantaHome: string, port: number): string {
  return join(kernelRunDir(vantaHome), `kernel-${port}.lock`);
}

function readLock(path: string): { text: string; lock: SpawnLock | null } | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = SpawnLockSchema.safeParse(JSON.parse(text));
    return { text, lock: parsed.success ? parsed.data : null };
  } catch {
    return { text, lock: null };
  }
}

function isStale(lock: SpawnLock | null, deps: SpawnLockDeps): boolean {
  if (!lock) return true;
  if (!deps.isAlive(lock.pid)) return true;
  return deps.now() - Date.parse(lock.startedAt) > SPAWN_LOCK_MAX_AGE_MS;
}

/** Remove a lock only if it still holds the content we judged stale: a fresh holder's lock is never deleted. */
function removeIfUnchanged(path: string, staleText: string): void {
  if (readLock(path)?.text !== staleText) return;
  try {
    unlinkSync(path);
  } catch {
    // someone else removed it first
  }
}

function tryCreate(path: string, lock: SpawnLock): boolean {
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify(lock));
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Claim the right to start the kernel on `port` for this profile. Exactly one process wins (O_EXCL create);
 * the others get `held` and must wait for that holder's kernel instead of starting a second one. A lock whose
 * holder died, is unreadable, or is older than SPAWN_LOCK_MAX_AGE_MS is replaced.
 */
export function acquireSpawnLock(vantaHome: string, port: number, overrides: Partial<SpawnLockDeps> = {}): SpawnLockResult {
  const deps = { ...defaultDeps, ...overrides };
  const path = kernelSpawnLockPath(vantaHome, port);
  mkdirSync(kernelRunDir(vantaHome), { recursive: true });
  const mine: SpawnLock = {
    version: 1, pid: deps.pid, token: randomBytes(8).toString("hex"), port, startedAt: new Date(deps.now()).toISOString(),
  };
  for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt++) {
    if (tryCreate(path, mine)) return { kind: "acquired", release: () => releaseIfOwned(path, mine.token) };
    const existing = readLock(path);
    if (!existing) continue; // vanished between create and read: try again
    if (!isStale(existing.lock, deps)) {
      return { kind: "held", holderPid: existing.lock?.pid ?? 0, startedAt: existing.lock?.startedAt ?? "" };
    }
    removeIfUnchanged(path, existing.text);
  }
  throw new Error(`Could not claim the kernel start lock ${path} after ${ACQUIRE_ATTEMPTS} attempts. Delete it if no Vanta runtime is starting.`);
}

function releaseIfOwned(path: string, token: string): void {
  const current = readLock(path);
  if (current?.lock?.token !== token) return;
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
}
