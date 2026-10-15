import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";

export class SessionStoreUnreadableError extends Error {
  readonly code = "session_store_unreadable";
  readonly recovery: string;
  constructor(readonly path: string, readonly reason: string) {
    const recovery = `Inspect ${path}; last-known-good candidate: ${path}.last-good. Recovery is explicit; suspect bytes remain untouched.`;
    super(`Session needs recovery (${reason}). ${recovery}`);
    this.name = "SessionStoreUnreadableError";
    this.recovery = recovery;
  }
}

export class SessionStoreConflictError extends Error {
  readonly code = "session_store_conflict";
  constructor(readonly path: string, reason: string) { super(`${reason}. Reload ${path} before saving.`); this.name = "SessionStoreConflictError"; }
}

const queues = new Map<string, Promise<void>>();
const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === "ENOENT";

export async function assertRegularSessionPath(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new SessionStoreUnreadableError(path, "not a regular file");
  } catch (error) { if (!missing(error)) throw error; }
}

export async function assertSessionDirectory(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isDirectory()) throw new SessionStoreUnreadableError(path, "session directory is not a directory");
  } catch (error) { if (!missing(error)) throw error; }
}

export async function readSessionBytes(path: string): Promise<string | null> {
  let handle;
  try {
    await assertSessionDirectory(dirname(path));
    await assertRegularSessionPath(path);
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    return await handle.readFile("utf8");
  } catch (error) {
    if (missing(error)) return null;
    if (error instanceof SessionStoreUnreadableError) throw error;
    throw new SessionStoreUnreadableError(path, (error as NodeJS.ErrnoException).code ?? "read failed");
  } finally { await handle?.close(); }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, "r");
  try { await handle.sync(); }
  catch (error) {
    if (!["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  } finally { await handle.close(); }
}

/** Same-directory exclusive creation and flushed rename; hook permits real crash fixtures. */
export async function atomicReplaceSessionFile(path: string, content: string, beforeReplace?: () => Promise<void>): Promise<void> {
  await assertSessionDirectory(dirname(path));
  await assertRegularSessionPath(path);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    await beforeReplace?.();
    await assertRegularSessionPath(path);
    await rename(temporary, path);
    await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeSessionBytes(path: string, content: string, previous: string | null): Promise<void> {
  if (previous !== null) await atomicReplaceSessionFile(`${path}.last-good`, previous);
  await atomicReplaceSessionFile(path, content);
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

async function removeDeadLock(path: string): Promise<boolean> {
  const reaper = `${path}.reap`;
  let handle;
  try { handle = await open(reaper, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try { return await removeDeadLockOwned(path); }
  finally { await handle.close(); await rm(reaper, { force: true }); }
}

async function removeDeadLockOwned(path: string): Promise<boolean> {
  const raw = await readSessionBytes(path);
  if (raw === null) return true;
  let owner: { pid?: number; token?: string };
  try { owner = JSON.parse(raw) as typeof owner; } catch { return false; }
  if (!Number.isSafeInteger(owner.pid) || (owner.pid ?? 0) < 1 || !owner.token || alive(owner.pid!)) return false;
  if (await readSessionBytes(path) !== raw) return false;
  await rm(path, { force: true });
  return true;
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  const lock = `${path}.lock`;
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() });
  const deadline = Date.now() + 10_000;
  while (true) {
    let handle;
    let created = false;
    try {
      handle = await open(lock, "wx", 0o600);
      created = true;
      await handle.writeFile(identity, "utf8");
      await handle.sync();
      await handle.close();
      return async () => { if (await readSessionBytes(lock) === identity) await rm(lock, { force: true }); };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (created) await rm(lock, { force: true }).catch(() => {});
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeDeadLock(lock)) continue;
      if (Date.now() >= deadline) throw new SessionStoreUnreadableError(path, "writer lock busy or incomplete; inspect lock before recovery");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function locked<T>(path: string, operation: () => Promise<T>): Promise<T> {
  await assertSessionDirectory(dirname(path));
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await assertSessionDirectory(dirname(path));
  await assertRegularSessionPath(path);
  const release = await acquireLock(path);
  try { return await operation(); } finally { await release(); }
}

export function withSessionLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => locked(path, operation));
  const tail = result.then(() => {}, () => {});
  queues.set(path, tail);
  void tail.finally(() => { if (queues.get(path) === tail) queues.delete(path); });
  return result;
}

export function sessionFilePath(directory: string, id: string): string {
  if (!id || basename(id) !== id || id === "." || id === ".." || id.includes("\\") || id.includes("\0")) {
    throw new Error("Session id must name one file inside the session directory");
  }
  return `${directory}/${id}.json`;
}
