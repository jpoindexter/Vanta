import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const FILE = "cron-runs.jsonl";
const SUMMARY_MAX = 2000;
const KEEP_MAX = 500;

const RunSchema = z.object({
  jobId: z.number().int(),
  at: z.string().min(1),
  trigger: z.enum(["manual", "scheduled"]),
  ok: z.boolean(),
  summary: z.string(),
  sessionId: z.string().optional(),
});
export type ScheduleRun = z.infer<typeof RunSchema>;

/** A run is a failure when the runner reported an error or a human gate instead of output. */
export function runSucceeded(result: string): boolean {
  return !/^(error:|needs human:)/.test(result);
}

export async function recordScheduleRun(dataDir: string, run: Omit<ScheduleRun, "summary"> & { summary: string }): Promise<ScheduleRun> {
  const value = RunSchema.parse({ ...run, summary: run.summary.slice(0, SUMMARY_MAX) });
  const path = join(dataDir, FILE);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return value;
}

/** Newest first; a missing or partly corrupt log never throws. */
export async function listScheduleRuns(dataDir: string, jobId: number, limit = 20): Promise<ScheduleRun[]> {
  let raw = "";
  try { raw = await readFile(join(dataDir, FILE), "utf8"); } catch { return []; }
  const runs: ScheduleRun[] = [];
  for (const line of raw.split("\n").slice(-KEEP_MAX * 4)) {
    if (!line.trim()) continue;
    try {
      const parsed = RunSchema.safeParse(JSON.parse(line));
      if (parsed.success && parsed.data.jobId === jobId) runs.push(parsed.data);
    } catch { /* skip a torn line */ }
  }
  return runs.reverse().slice(0, Math.max(1, limit));
}

/** Last recorded run for every job, for the list view. */
export async function lastRunByJob(dataDir: string): Promise<Map<number, ScheduleRun>> {
  let raw = "";
  try { raw = await readFile(join(dataDir, FILE), "utf8"); } catch { return new Map(); }
  const last = new Map<number, ScheduleRun>();
  for (const line of raw.split("\n")) {
    try {
      const parsed = RunSchema.safeParse(JSON.parse(line));
      if (parsed.success) last.set(parsed.data.jobId, parsed.data);
    } catch { /* skip a torn line */ }
  }
  return last;
}
