import { z } from "zod";
import { readFile, writeFile, mkdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";

// VANTA-ASYNC-DELEGATE — delegate(background:true) returns immediately; the
// worker runs detached and, on completion, appends its result here. The REPL
// drains this queue at its IDLE boundary (top of the loop, between turns) and
// re-enters the result as a fresh turn — so message order and the prompt cache
// are preserved (the result lands as a normal new turn, never mid-turn). Drain
// renames-then-reads so a concurrent enqueue is never lost to the clear.

const ResultSchema = z.object({
  id: z.string(),
  goal: z.string(),
  output: z.string(),
  finishedAt: z.string(),
});
export type AsyncResult = z.infer<typeof ResultSchema>;

const FILE = "async-delegate.jsonl";
const filePath = (dataDir: string): string => join(dataDir, FILE);

export async function enqueueAsyncResult(dataDir: string, entry: AsyncResult): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath(dataDir), `${JSON.stringify(entry)}\n`, { flag: "a" });
}

async function readResultsFrom(path: string): Promise<AsyncResult[]> {
  let raw = "";
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed = ResultSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

/** Format finished background results as a single re-entry turn. Pure. */
export function formatAsyncReentry(results: AsyncResult[]): string {
  const lines = results.map((r) => `- (${r.goal}) → ${r.output}`);
  return `A background delegation finished while you were idle — incorporate the result(s):\n${lines.join("\n")}`;
}

/**
 * Drain the queue and return a re-entry turn, or null when empty. Renames the
 * file first (atomic) then reads it, so a worker that enqueues during the drain
 * lands in the fresh file and is picked up next time — never lost.
 */
export async function drainAsyncReentry(dataDir: string): Promise<string | null> {
  const src = filePath(dataDir);
  const tmp = `${src}.draining`;
  try {
    await rename(src, tmp);
  } catch {
    return null; // nothing queued
  }
  const results = await readResultsFrom(tmp);
  await rm(tmp, { force: true }).catch(() => {});
  return results.length ? formatAsyncReentry(results) : null;
}

export async function peekAsyncCount(dataDir: string): Promise<number> {
  return (await readResultsFrom(filePath(dataDir))).length;
}
