import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// VANTA-CONCURRENT-SESSIONS — a shared registry of running Vanta instances so a
// session can discover its siblings. Each live instance registers {pid, sessionId,
// project, startedAt} in ~/.vanta/active-sessions.json; listing PRUNES any entry
// whose pid is no longer alive (a crash leaves a stale row, never reaped on exit).
//
// Pure/injectable by design: every side effect (read/write/now/isAlive) is a dep,
// so register/list/prune are fully unit-tested with no real processes or files.
// Registry interaction is best-effort — a failure here must NEVER affect a session
// (the lifecycle wiring swallows it), so the writers fail closed and never throw.

const REGISTRY_FILE = "active-sessions.json";

const ActiveSessionSchema = z.object({
  pid: z.number().int().positive(),
  sessionId: z.string().min(1),
  project: z.string(),
  startedAt: z.string(),
});

/** One running Vanta instance, as recorded in the shared registry. */
export type ActiveSession = z.infer<typeof ActiveSessionSchema>;

/** Predicate: is this OS process still alive? Injected so tests never poke real pids. */
export type IsAlive = (pid: number) => boolean;

/** Injected effects for the registry — all I/O + clock + liveness are deps. */
export interface RegistryDeps {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
  isAlive: IsAlive;
  now: () => Date;
}

/**
 * Parse stored registry JSON into valid entries. Tolerant: a missing file
 * (`null`), non-array, or unparseable content yields `[]`, and any individual
 * row that fails the schema is dropped rather than rejecting the whole file.
 */
export function parseRegistry(raw: string | null): ActiveSession[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return []; // corrupt JSON → empty, never throw
  }
  if (!Array.isArray(data)) return [];
  const out: ActiveSession[] = [];
  for (const row of data) {
    const parsed = ActiveSessionSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Live entries only — those whose pid `isAlive` reports as still running. Pure. */
export function pruneDead(entries: ActiveSession[], isAlive: IsAlive): ActiveSession[] {
  return entries.filter((e) => isAlive(e.pid));
}

/**
 * Register this instance: append `entry` to the registry, replacing any prior row
 * for the same pid (a reused pid never double-registers). Best-effort — a read or
 * write failure is swallowed so registration never throws into the session.
 */
export async function registerSession(
  entry: Omit<ActiveSession, "startedAt"> & { startedAt?: string },
  deps: RegistryDeps,
): Promise<void> {
  try {
    const current = parseRegistry(await deps.read());
    const row: ActiveSession = {
      pid: entry.pid,
      sessionId: entry.sessionId,
      project: entry.project,
      startedAt: entry.startedAt ?? deps.now().toISOString(),
    };
    const next = [...current.filter((e) => e.pid !== row.pid), row];
    await deps.write(JSON.stringify(next, null, 2));
  } catch {
    // best-effort — a registry failure must never break the session
  }
}

/**
 * List running instances, pruning any whose pid is dead. The pruned list is
 * written back (best-effort) so stale rows from crashed instances self-heal.
 * Tolerant: returns `[]` on any read/parse failure.
 */
export async function listActiveSessions(deps: RegistryDeps): Promise<ActiveSession[]> {
  let live: ActiveSession[];
  try {
    live = pruneDead(parseRegistry(await deps.read()), deps.isAlive);
  } catch {
    return []; // read failure → empty, never throw
  }
  try {
    await deps.write(JSON.stringify(live, null, 2)); // persist the prune
  } catch {
    // best-effort — listing still returns the live set even if the rewrite fails
  }
  return live;
}

/**
 * Deregister by pid: remove this instance's row on clean exit. Idempotent — a pid
 * with no row is a no-op. Best-effort: a read/write failure is swallowed.
 */
export async function deregisterSession(pid: number, deps: RegistryDeps): Promise<void> {
  try {
    const remaining = parseRegistry(await deps.read()).filter((e) => e.pid !== pid);
    await deps.write(JSON.stringify(remaining, null, 2));
  } catch {
    // best-effort — failing to deregister leaves a stale row that listing prunes
  }
}

/** Default real `isAlive` — `process.kill(pid, 0)` probes without signalling. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = no such process (dead); EPERM = alive but not ours (still alive).
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/**
 * Build {@link RegistryDeps} backed by the real `~/.vanta/active-sessions.json`
 * file (honours `VANTA_HOME`). The wiring layer uses this; tests inject their own.
 */
export function defaultRegistryDeps(env: NodeJS.ProcessEnv = process.env): RegistryDeps {
  const path = join(resolveVantaHome(env), REGISTRY_FILE);
  return {
    read: async () => {
      try {
        return await readFile(path, "utf8");
      } catch {
        return null; // missing file → tolerant reader yields []
      }
    },
    write: async (content) => {
      await mkdir(resolveVantaHome(env), { recursive: true });
      await writeFile(path, content, "utf8");
    },
    isAlive: processIsAlive,
    now: () => new Date(),
  };
}
