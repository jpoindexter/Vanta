import { z } from "zod";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

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

function storePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "verify.jsonl");
}

export function appendLock(lock: Lock, env: NodeJS.ProcessEnv = process.env): void {
  appendFileSync(storePath(env), JSON.stringify(lock) + "\n");
}

/** Read every record, dropping corrupt lines (tolerant reader). */
function readRecords(env: NodeJS.ProcessEnv): Lock[] {
  const path = storePath(env);
  if (!existsSync(path)) return [];
  const out: Lock[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
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
export function latestLocks(env: NodeJS.ProcessEnv = process.env): Lock[] {
  const byId = new Map<string, Lock>();
  for (const rec of readRecords(env)) byId.set(rec.id, rec);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function findLock(id: string, env: NodeJS.ProcessEnv = process.env): Lock | undefined {
  return latestLocks(env).find((l) => l.id === id);
}
