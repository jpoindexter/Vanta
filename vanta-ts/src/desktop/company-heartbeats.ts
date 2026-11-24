import type { z } from "zod";
import { redactForLog } from "../store/redact-structural.js";
import { loadRuns } from "../heartbeat/runtime.js";
import type { CompanyCtx } from "./company-context.js";
import type { HeartbeatsResponseSchema } from "./company-finance-schemas.js";
import { deriveStatus, workerHeartbeat } from "./company-roster.js";
import type { CompanySnapshot } from "./company-snapshot.js";

export type HeartbeatsResponse = z.infer<typeof HeartbeatsResponseSchema>;

const NOTE =
  "runs is the company wakeup pipeline log (heartbeat-runs.json). It drains loop wakes, not team tasks. "
  + "Per-worker heartbeats are derived: the latest run, task update or roster write. Routine and cron rows are served by /api/schedules.";

export async function buildHeartbeats(ctx: CompanyCtx, snap: CompanySnapshot): Promise<HeartbeatsResponse> {
  const runs = await loadRuns(ctx.dataDir);
  return {
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt ?? null,
      stage: r.stage ?? null,
      error: r.error ? redactForLog(r.error) : null,
    })),
    workers: snap.workers.map((worker) => {
      const beat = workerHeartbeat(snap, worker);
      const tasks = snap.tasks.filter((t) => t.workerId === worker.id);
      const current = deriveStatus(worker, tasks, snap.runs.filter((r) => r.workerId === worker.id)).current;
      return { workerId: worker.id, lastHeartbeat: beat.at, source: beat.source, currentTicketId: current?.id ?? null };
    }),
    schedulesUrl: "/api/schedules",
    note: NOTE,
  };
}
