import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ContinuityStoreSchema, type ContinuityStore } from "./types.js";

const queues = new Map<string, Promise<void>>();
const emptyStore = (): ContinuityStore => ({ version: 1, revision: 0, items: [], runs: [], approvals: [], receipts: [] });

export function continuityStorePath(root: string): string {
  return join(root, ".vanta", "operator-work.json");
}

export class ContinuityStoreUnreadableError extends Error {}

export async function readContinuityStore(root: string): Promise<ContinuityStore> {
  try {
    return ContinuityStoreSchema.parse(JSON.parse(await readFile(continuityStorePath(root), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new ContinuityStoreUnreadableError(error instanceof Error ? error.message : String(error));
  }
}

async function stale(path: string): Promise<boolean> {
  try { return Date.now() - (await stat(path)).mtimeMs > 30_000; } catch { return false; }
}

async function fileLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const lock = join(root, ".vanta", "operator-work.lock");
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.writeFile(`${process.pid}:${randomUUID()}\n`, "utf8");
      await handle.close();
      try { return await operation(); } finally { await rm(lock, { force: true }); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await stale(lock)) { await rm(lock, { force: true }); continue; }
      if (Date.now() >= deadline) throw new Error("continuity store is busy");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

export function withContinuityLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(root) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(() => fileLock(root, operation));
  const tail = result.then(() => undefined, () => undefined);
  queues.set(root, tail);
  void tail.finally(() => { if (queues.get(root) === tail) queues.delete(root); });
  return result;
}

export async function writeContinuityStore(root: string, store: ContinuityStore): Promise<void> {
  const path = continuityStorePath(root);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(ContinuityStoreSchema.parse(store), null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temporary, path); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}
