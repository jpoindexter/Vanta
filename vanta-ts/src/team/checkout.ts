import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { TaskResult } from "./tasks.js";

// Atomic task checkout: a per-task execution lock so two parallel workers
// never claim (and therefore double-work) the same task. Backed by an
// exclusive-create lock file ("wx" → O_EXCL); the create is atomic at the
// filesystem layer, so exactly one concurrent caller wins and the rest are
// refused. Mirrors the inline lock pattern in factory/run.ts, generalised
// to a reusable, crash-safe (stale-pid reclaim) primitive.

export const CheckoutRecordSchema = z.object({
  taskId: z.string().min(1),
  workerId: z.string().min(1),
  pid: z.number().int(),
  acquired: z.string().min(1),
});
export type CheckoutRecord = z.infer<typeof CheckoutRecordSchema>;

export type CheckoutHandle = {
  taskId: string;
  workerId: string;
  path: string;
  release: () => Promise<void>;
};

export type CheckoutArgs = {
  taskId: string;
  workerId: string;
  dir: string;
  now?: () => Date;
};

/** Filesystem-safe lock path for a task id (ids carry ":" / "/" from fleet ids). */
export function lockPath(dir: string, taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return join(dir, `${safe}.lock`);
}

function makeRecord(args: CheckoutArgs): CheckoutRecord {
  return {
    taskId: args.taskId,
    workerId: args.workerId,
    pid: process.pid,
    acquired: (args.now?.() ?? new Date()).toISOString(),
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH → no such process (dead, reclaimable); EPERM → alive but not ours.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readHolder(path: string): Promise<CheckoutRecord | null> {
  try {
    const parsed = CheckoutRecordSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Atomic create. ok → won the lock; "exists" → already held; else an io error. */
async function tryCreate(path: string, record: CheckoutRecord): Promise<TaskResult<true>> {
  try {
    await writeFile(path, JSON.stringify(record), { flag: "wx" });
    return { ok: true, value: true };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EEXIST") return { ok: false, error: "exists" };
    return { ok: false, error: `checkout io error: ${e.message}` };
  }
}

function heldError(taskId: string, holder: CheckoutRecord | null): string {
  const who = holder
    ? `${holder.workerId} (pid ${holder.pid}, since ${holder.acquired})`
    : "another worker";
  return `task "${taskId}" already checked out by ${who}`;
}

function makeHandle(record: CheckoutRecord, path: string): CheckoutHandle {
  return {
    taskId: record.taskId,
    workerId: record.workerId,
    path,
    release: async () => {
      await rm(path, { force: true }).catch(() => {});
    },
  };
}

/**
 * Atomically claim a task. Returns a handle on success, or an error if the
 * task is already checked out by a live worker. A lock held by a dead pid is
 * reclaimed once (the reclaim retry is itself atomic, so only one reclaimer
 * can win the race).
 */
export async function checkoutTask(args: CheckoutArgs): Promise<TaskResult<CheckoutHandle>> {
  await mkdir(args.dir, { recursive: true });
  const path = lockPath(args.dir, args.taskId);
  const record = makeRecord(args);

  const first = await tryCreate(path, record);
  if (first.ok) return { ok: true, value: makeHandle(record, path) };
  if (first.error !== "exists") return { ok: false, error: first.error };

  const holder = await readHolder(path);
  if (holder && !isAlive(holder.pid)) {
    await rm(path, { force: true }).catch(() => {});
    const retry = await tryCreate(path, record);
    if (retry.ok) return { ok: true, value: makeHandle(record, path) };
    return { ok: false, error: heldError(args.taskId, await readHolder(path)) };
  }
  return { ok: false, error: heldError(args.taskId, holder) };
}

/**
 * Run `fn` under an exclusive task checkout, releasing the lock afterward.
 * If the task is already held, `fn` never runs and the refusal is returned.
 */
export async function withTaskCheckout<T>(
  args: CheckoutArgs,
  fn: (handle: CheckoutHandle) => Promise<T>,
): Promise<TaskResult<T>> {
  const claim = await checkoutTask(args);
  if (!claim.ok) return claim;
  try {
    return { ok: true, value: await fn(claim.value) };
  } finally {
    await claim.value.release();
  }
}
