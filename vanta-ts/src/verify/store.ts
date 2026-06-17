import { z } from "zod";
import { resolveMemoryStore } from "../store/memory-store.js";

/**
 * A regression lock: a claim the operator has verified true, paired with the
 * shell command that proves it and the substring that command's output must
 * contain. Re-running the command later and losing the substring = a regression.
 * Append-only; latest record per id wins (status updates append a new line).
 */
export const LockSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  command: z.string().min(1),
  expect: z.string().min(1),
  status: z.enum(["locked", "passing", "regressed"]),
  detail: z.string().optional(),
  created: z.number(),
  updated: z.number(),
});

export type Lock = z.infer<typeof LockSchema>;

const STORE_FILE = "verify.jsonl";

export async function appendLock(lock: Lock, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await resolveMemoryStore(env).append(STORE_FILE, JSON.stringify(lock) + "\n");
}

/** Read every record, dropping corrupt lines (tolerant reader). */
async function readRecords(env: NodeJS.ProcessEnv): Promise<Lock[]> {
  const raw = await resolveMemoryStore(env).read(STORE_FILE);
  if (raw === null) return [];
  const out: Lock[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = LockSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // skip a malformed line — never let one bad record break the store
    }
  }
  return out;
}

/** Latest record per id (status updates supersede earlier ones), id-sorted. */
export async function latestLocks(env: NodeJS.ProcessEnv = process.env): Promise<Lock[]> {
  const byId = new Map<string, Lock>();
  for (const rec of await readRecords(env)) byId.set(rec.id, rec);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function findLock(id: string, env: NodeJS.ProcessEnv = process.env): Promise<Lock | undefined> {
  return (await latestLocks(env)).find((l) => l.id === id);
}
