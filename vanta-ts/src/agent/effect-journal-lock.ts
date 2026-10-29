import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const journalQueues = new Map<string, Promise<void>>();
const JOURNAL_LOCK_RETRY_MS = 25;
const JOURNAL_LOCK_TIMEOUT_MS = 10_000;
const JOURNAL_INCOMPLETE_LOCK_STALE_MS = 30_000;

type JournalWriterLock = {
  version: 1;
  pid: number;
  token: string;
  acquiredAt: string;
};

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeAbandonedJournalLock(lockPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  const lock = parseWriterLock(raw);
  if (lock && processIsAlive(lock.pid)) return false;
  if (!lock) {
    const age = Date.now() - (await stat(lockPath)).mtimeMs;
    if (age < JOURNAL_INCOMPLETE_LOCK_STALE_MS) return false;
  }
  // Compare bytes again so a released lock cannot cause deletion of its
  // successor. Every owner token is random.
  try {
    if (await readFile(lockPath, "utf8") !== raw) return false;
    await rm(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

function parseWriterLock(raw: string): JournalWriterLock | undefined {
  let lock: Partial<JournalWriterLock> | undefined;
  try { lock = JSON.parse(raw) as Partial<JournalWriterLock>; }
  catch { return undefined; } // A writer may not have written its identity yet.
  if (lock?.version === 1 && Number.isSafeInteger(lock.pid) && (lock.pid ?? 0) > 0
    && typeof lock.token === "string" && typeof lock.acquiredAt === "string") {
    return lock as JournalWriterLock;
  }
  return undefined;
}

async function withJournalWriterLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const journalDir = join(root, ".vanta", "effect-journal");
  await mkdir(journalDir, { recursive: true, mode: 0o700 });
  const lockPath = join(journalDir, "writer.lock");
  const token = randomUUID();
  const startedAt = Date.now();
  const lock: JournalWriterLock = {
    version: 1,
    pid: process.pid,
    token,
    acquiredAt: new Date().toISOString(),
  };
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(lock)}\n`, "utf8");
      await handle.close();
      handle = undefined;
      break;
    } catch (error) {
      await handle?.close().catch(() => {});
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeAbandonedJournalLock(lockPath)) continue;
      if (Date.now() - startedAt >= JOURNAL_LOCK_TIMEOUT_MS) {
        throw new Error("timed out waiting for effect journal writer lock");
      }
      await new Promise((resolve) => setTimeout(resolve, JOURNAL_LOCK_RETRY_MS));
    }
  }
  try {
    return await task();
  } finally {
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8")) as Partial<JournalWriterLock>;
      if (current.token === token && current.pid === process.pid) await rm(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function withJournalLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const previous = journalQueues.get(root) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => withJournalWriterLock(root, task));
  const tail = result.then(() => {}, () => {});
  journalQueues.set(root, tail);
  void tail.finally(() => {
    if (journalQueues.get(root) === tail) journalQueues.delete(root);
  });
  return result;
}
