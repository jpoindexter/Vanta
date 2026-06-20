import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// PCLIP-HEARTBEAT-RUNTIME — one wakeup runs the coalesced
// budget → workspace → secret → skill → adapter pipeline, then executes the
// queued work, tracking the run in .vanta/heartbeat-runs.json. On every wakeup it
// first recovers ORPHANED runs (status "running" whose pid is dead — a crash/
// restart), so a dead run never blocks the next one. Mirrors the proactive-tick
// orchestrator shape: pure decisions + injected side effects → fully testable.

const RunSchema = z.object({
  id: z.string(),
  status: z.enum(["running", "done", "failed", "recovered"]),
  pid: z.number(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  stage: z.string().optional(),
  error: z.string().optional(),
});
export type HeartbeatRun = z.infer<typeof RunSchema>;

/** The pipeline stage order the card names; default stages are built in this order. */
export const STAGE_ORDER = ["budget", "workspace", "secret", "skill", "adapter"] as const;

const FILE = "heartbeat-runs.json";
const runsPath = (dataDir: string): string => join(dataDir, FILE);

export async function loadRuns(dataDir: string): Promise<HeartbeatRun[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(runsPath(dataDir), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => {
      const p = RunSchema.safeParse(r);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}

export async function saveRuns(dataDir: string, runs: HeartbeatRun[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(runsPath(dataDir), `${JSON.stringify(runs, null, 2)}\n`, "utf8");
}

/** Pure: any run still "running" whose pid is dead is an orphan → mark recovered. */
export function recoverOrphans(
  runs: HeartbeatRun[],
  isAlive: (pid: number) => boolean,
  now: Date,
): { runs: HeartbeatRun[]; recovered: string[] } {
  const recovered: string[] = [];
  const next = runs.map((r) => {
    if (r.status !== "running" || isAlive(r.pid)) return r;
    recovered.push(r.id);
    return { ...r, status: "recovered" as const, finishedAt: now.toISOString(), error: "orphaned run recovered on restart" };
  });
  return { runs: next, recovered };
}

const markRun = (runs: HeartbeatRun[], id: string, patch: Partial<HeartbeatRun>): HeartbeatRun[] =>
  runs.map((r) => (r.id === id ? { ...r, ...patch } : r));

export type HeartbeatStage = { name: string; run: () => Promise<{ ok: boolean; reason?: string }> };

export type HeartbeatDeps = {
  dataDir: string;
  now: () => Date;
  pid: number;
  isAlive: (pid: number) => boolean;
  /** Items queued for this wakeup (e.g. pending loop wakes); 0 → coalesce to no-op. */
  queuedCount: () => Promise<number>;
  /** The ordered pipeline gates (budget → workspace → secret → skill → adapter). */
  stages: HeartbeatStage[];
  /** Run the queued work once all stages pass; returns how many items it ran. */
  execute: () => Promise<{ ran: number }>;
  newId: () => string;
};

export type HeartbeatResult = {
  recovered: string[];
  ran: number;
  ranPipeline: boolean;
  failedStage?: string;
  runId?: string;
};

/**
 * One heartbeat wakeup: recover orphans → coalesce (skip if nothing queued) →
 * walk the pipeline in order (short-circuit on the first failing gate) → execute
 * the work, tracking the run's status throughout. Best-effort persistence.
 */
export async function runHeartbeat(deps: HeartbeatDeps): Promise<HeartbeatResult> {
  const loaded = await loadRuns(deps.dataDir);
  const { runs: afterRecover, recovered } = recoverOrphans(loaded, deps.isAlive, deps.now());

  if ((await deps.queuedCount()) <= 0) {
    await saveRuns(deps.dataDir, afterRecover);
    return { recovered, ran: 0, ranPipeline: false };
  }

  const runId = deps.newId();
  let runs = [...afterRecover, { id: runId, status: "running" as const, pid: deps.pid, startedAt: deps.now().toISOString() }];
  await saveRuns(deps.dataDir, runs);

  for (const stage of deps.stages) {
    const res = await stage.run();
    if (!res.ok) {
      runs = markRun(runs, runId, { status: "failed", finishedAt: deps.now().toISOString(), stage: stage.name, error: res.reason });
      await saveRuns(deps.dataDir, runs);
      return { recovered, ran: 0, ranPipeline: true, failedStage: stage.name, runId };
    }
  }

  let ran = 0;
  try {
    ({ ran } = await deps.execute());
    runs = markRun(runs, runId, { status: "done", finishedAt: deps.now().toISOString() });
  } catch (err) {
    runs = markRun(runs, runId, { status: "failed", finishedAt: deps.now().toISOString(), error: err instanceof Error ? err.message : String(err) });
  }
  await saveRuns(deps.dataDir, runs);
  return { recovered, ran, ranPipeline: true, runId };
}

/** Default OS pid-liveness probe. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
