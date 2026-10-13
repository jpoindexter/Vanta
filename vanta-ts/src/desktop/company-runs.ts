import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { RunRecordSchema, type RunRecord } from "./company-schemas.js";

// Worker run history. The engine keeps no per-task run record (team-run.ts
// discards usage and cost), so the desktop runtime writes one here. Append-only
// JSONL, latest row per runId wins (a run is written once at start and again at
// finish). Lives under the Vanta home next to the team ledger.

const FILE = "company-runs.jsonl";

export const runsPath = (home: string): string => join(home, FILE);

export async function appendRun(home: string, record: RunRecord): Promise<void> {
  await mkdir(home, { recursive: true });
  await appendFile(runsPath(home), `${JSON.stringify(RunRecordSchema.parse(record))}\n`, "utf8");
}

/** Tolerant read: one run per id (latest row), oldest first. Absent file gives []. */
export async function readRuns(home: string): Promise<RunRecord[]> {
  let raw: string;
  try {
    raw = await readFile(runsPath(home), "utf8");
  } catch {
    return [];
  }
  const byId = new Map<string, RunRecord>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = RunRecordSchema.safeParse(JSON.parse(line));
      if (parsed.success) byId.set(parsed.data.runId, parsed.data);
    } catch { /* skip a corrupt line */ }
  }
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export const runsForTicket = (runs: RunRecord[], ticketId: string): RunRecord[] => runs.filter((r) => r.ticketId === ticketId);

export function latestRun(runs: RunRecord[], match: (run: RunRecord) => boolean): RunRecord | undefined {
  return runs.filter(match).at(-1);
}
