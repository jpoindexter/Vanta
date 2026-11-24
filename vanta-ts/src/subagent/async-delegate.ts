import { open, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { checkoutTask } from "../team/checkout.js";
import { AsyncResultSchema, isAsyncSuccess, readAsyncQueue, type AsyncRecord, type AsyncResult } from "./async-result-record.js";

export type { AsyncResult } from "./async-result-record.js";
export type AsyncDelivery = { kind: "ready"; claimId: string; prompt: string }
  | { kind: "review"; message: string };
const FILE = "async-delegate.jsonl";
const filePath = (dataDir: string): string => join(dataDir, FILE);

async function readQueue(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function appendRecord(dataDir: string, record: AsyncRecord): Promise<void> {
  const handle = await open(filePath(dataDir), "a", 0o600);
  try { await handle.writeFile(`${JSON.stringify(record)}\n`); await handle.sync(); }
  finally { await handle.close(); }
}

async function withQueueLock<T>(dataDir: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dataDir, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    const claim = await checkoutTask({ dir: dataDir, taskId: "async-delegate", workerId: "background-delivery" });
    if (claim.ok) {
      try { return await action(); }
      finally { await claim.value.release(); }
    }
    if (!claim.error.includes("already checked out")) throw new Error(claim.error);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Background delivery store is busy; no result was delivered");
}

export async function enqueueAsyncResult(dataDir: string, entry: AsyncResult): Promise<void> {
  const parsed = AsyncResultSchema.parse(entry);
  await withQueueLock(dataDir, () => appendRecord(dataDir, parsed));
}

/** Reserve custody before a detached child can perform any work. */
export async function beginAsyncResult(dataDir: string, id: string): Promise<void> {
  await withQueueLock(dataDir, () => appendRecord(dataDir, { event: "started", id }));
}

/** Retain an explicit hold even if a later manual turn succeeds. */
export async function pauseAsyncFollowup(dataDir: string): Promise<void> {
  await withQueueLock(dataDir, async () => {
    const raw = await readQueue(filePath(dataDir));
    if (!raw.split("\n").includes('{"event":"review"}')) await appendRecord(dataDir, { event: "review" });
  });
}

/** Pure summary formatting, never permission to continue an uncertain worker. */
export function formatAsyncReentry(results: AsyncResult[]): string {
  if (results.some(result => !isAsyncSuccess(result))) throw new Error("Background result requires review");
  const lines = results.map(result => `- (${result.goal}) → ${result.output}`);
  return `A background delegation finished while you were idle — incorporate the result(s):\n${lines.join("\n")}`;
}

function review(): AsyncDelivery {
  return { kind: "review", message: "Background work is unfinished or needs review. Automatic follow-up is paused; inspect async-delegate.jsonl and any .draining file before continuing. Nothing was retried." };
}

/** Claim before invoking a model. The append-only claim survives a crash. */
export async function drainAsyncReentry(dataDir: string): Promise<AsyncDelivery | null> {
  return withQueueLock(dataDir, async () => {
    if ((await readQueue(`${filePath(dataDir)}.draining`)).trim()) return review();
    const state = readAsyncQueue(await readQueue(filePath(dataDir)));
    if (state.review) return review();
    if (!state.pending.length) return null;
    const claimId = randomUUID();
    await appendRecord(dataDir, { event: "claim", id: claimId, resultIds: state.pending.map(result => result.id) });
    return { kind: "ready", claimId, prompt: formatAsyncReentry(state.pending) };
  });
}

/** Delivery acknowledgment is not worker/task verification and cannot clear review. */
export async function acknowledgeAsyncReentry(dataDir: string, claimId: string): Promise<void> {
  await withQueueLock(dataDir, async () => {
    const state = readAsyncQueue(await readQueue(filePath(dataDir)));
    if (!state.claims.has(claimId)) throw new Error("Unknown background delivery claim");
    await appendRecord(dataDir, { event: "delivered", id: claimId });
  });
}

export async function peekAsyncCount(dataDir: string): Promise<number> {
  return withQueueLock(dataDir, async () => readAsyncQueue(await readQueue(filePath(dataDir))).pending.length);
}
