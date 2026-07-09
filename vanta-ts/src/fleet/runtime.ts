import type { FleetReport, FleetRuntimeService } from "./types.js";

export type RuntimeAttachInput = {
  workerId: string;
  command: string;
  port: number;
  host?: string;
  pid?: number;
  now?: Date;
};

export type RuntimeAttachResult =
  | { ok: true; report: FleetReport; service: FleetRuntimeService }
  | { ok: false; error: string };

export function previewUrl(port: number, host = "127.0.0.1"): string {
  return `http://${host}:${port}/`;
}

export function latestPreviewUrl(report: FleetReport, workerId: string): string | null {
  const worker = report.workers.find((w) => w.id === workerId);
  const services = worker?.runtimeServices?.filter((s) => s.kind === "preview" && s.status !== "stopped") ?? [];
  return services.at(-1)?.url ?? null;
}

export function attachRuntimeService(report: FleetReport, input: RuntimeAttachInput): RuntimeAttachResult {
  const command = input.command.trim();
  if (!command) return { ok: false, error: "runtime command is required" };
  if (!Number.isInteger(input.port) || input.port <= 0) return { ok: false, error: "runtime port must be a positive integer" };
  const worker = report.workers.find((w) => w.id === input.workerId);
  if (!worker) return { ok: false, error: `worker not found: ${input.workerId}` };
  if (!worker.worktreePath.trim()) return { ok: false, error: `worker has no worktree path: ${input.workerId}` };

  const now = input.now ?? new Date();
  const prior = worker.runtimeServices?.length ?? 0;
  const service: FleetRuntimeService = {
    id: `${worker.id}-preview-${prior + 1}`,
    kind: "preview",
    command,
    port: input.port,
    url: previewUrl(input.port, input.host),
    pid: input.pid,
    status: "running",
    startedAt: now.toISOString(),
    worktreePath: worker.worktreePath,
  };
  return {
    ok: true,
    service,
    report: {
      ...report,
      updated: now.toISOString(),
      workers: report.workers.map((w) => (
        w.id === worker.id ? { ...w, runtimeServices: [...(w.runtimeServices ?? []), service], updated: now.toISOString() } : w
      )),
    },
  };
}
