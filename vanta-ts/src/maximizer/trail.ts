import { mkdir, readFile, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";

// The visible activity trail for a maximizer run. One JSONL line per delegated
// task under `.vanta/maximizer/<runId>.jsonl`, plus a pure formatter so the
// trail can be surfaced to the operator. Tolerant reader: a corrupt line is
// dropped, never throws — the trail is an audit aid, not a source of truth.

export const ActivitySchema = z.object({
  task: z.string().min(1),
  ok: z.boolean(),
  costUsd: z.number().min(0),
  summary: z.string().default(""),
  ts: z.number(),
});
export type Activity = z.infer<typeof ActivitySchema>;

/** `.vanta/maximizer/<runId>.jsonl` under a data dir. Pure. */
export function trailPath(dataDir: string, runId: string): string {
  return join(dataDir, "maximizer", `${runId}.jsonl`);
}

/** Append one activity entry as a JSONL line, creating the dir on first write. */
export async function appendActivity(file: string, entry: Activity): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(ActivitySchema.parse(entry))}\n`, "utf8");
}

/** Read the activity trail, dropping any malformed line. Missing file → []. */
export async function readActivity(file: string): Promise<Activity[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: Activity[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = ActivitySchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // tolerant: skip a corrupt line
    }
  }
  return out;
}

/** Render the trail as a compact, human-readable block. Pure. */
export function formatTrail(entries: Activity[]): string {
  if (entries.length === 0) return "(no activity)";
  return entries
    .map((e, i) => {
      const mark = e.ok ? "✓" : "✗";
      const cost = `$${e.costUsd.toFixed(2)}`;
      const summary = e.summary ? ` — ${e.summary}` : "";
      return `${i + 1}. ${mark} ${e.task} (${cost})${summary}`;
    })
    .join("\n");
}
