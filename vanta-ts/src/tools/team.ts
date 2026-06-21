import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import { appendTeam, readTeam, latestWorkers, type Worker } from "../team/store.js";
import {
  appendTask,
  readTasks,
  latestTasks,
  assignTask,
  advanceTask,
  tasksForWorker,
  type TaskStatus,
} from "../team/tasks.js";
import { doRun } from "./team-run.js";
import { resolveTaskArtifactProbe } from "./task-outcome-probe.js";

const TASK_STATUSES = ["assigned", "running", "done", "blocked"] as const;

const Args = z.object({
  action: z.enum(["define", "status", "list", "dispatch", "advance", "tasks", "run"]),
  id: z.string().optional(),
  role: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  note: z.string().optional(),
  status: z.enum(["idle", "running", "blocked", "done"]).optional(),
  // task fields
  taskId: z.string().optional(),
  workerId: z.string().optional(),
  title: z.string().optional(),
  taskStatus: z.enum(TASK_STATUSES).optional(),
  detail: z.string().optional(),
});
type Parsed = z.infer<typeof Args>;

async function doDefine(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.role) return { ok: false, output: "define needs id, role" };
  const existing = latestWorkers(await readTeam()).find((w) => w.id === a.id);
  const rec: Worker = {
    kind: "worker",
    id: a.id,
    role: a.role,
    model: a.model ?? existing?.model,
    tools: a.tools ?? existing?.tools,
    status: existing?.status ?? "idle",
    note: a.note ?? existing?.note,
    ts: new Date().toISOString(),
  };
  await appendTeam(rec);
  return { ok: true, output: `defined worker ${a.id} (${a.role})` };
}

async function doStatus(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.status) return { ok: false, output: "status needs id, status" };
  const workers = latestWorkers(await readTeam());
  const existing = workers.find((w) => w.id === a.id);
  if (!existing) return { ok: false, output: `unknown worker id "${a.id}" — define it first` };
  await appendTeam({ ...existing, status: a.status, ts: new Date().toISOString() });
  return { ok: true, output: `${a.id} → ${a.status}` };
}

function formatRoster(workers: Worker[]): string {
  if (!workers.length) return "team roster is empty — define workers first (action:define)";
  return workers.map((w) => `${w.id} · ${w.role} · ${w.status}${w.note ? ` — ${w.note}` : ""}`).join("\n");
}

async function doList(): Promise<ToolResult> {
  const workers = latestWorkers(await readTeam());
  return { ok: true, output: formatRoster(workers) };
}

async function doDispatch(a: Parsed): Promise<ToolResult> {
  if (!a.taskId || !a.workerId || !a.title) {
    return { ok: false, output: "dispatch needs taskId, workerId, title" };
  }
  const existing = await readTasks();
  const result = assignTask(existing, a.taskId, a.workerId, a.title);
  if (!result.ok) return { ok: false, output: result.error };
  await appendTask(result.value);
  return { ok: true, output: `task ${a.taskId} assigned to ${a.workerId}: ${a.title}` };
}

async function doAdvance(a: Parsed): Promise<ToolResult> {
  if (!a.taskId || !a.taskStatus) {
    return { ok: false, output: "advance needs taskId, taskStatus" };
  }
  const all = latestTasks(await readTasks());
  const task = all.find((t) => t.id === a.taskId);
  if (!task) return { ok: false, output: `unknown task id "${a.taskId}" — dispatch it first` };
  // ENFORCED-OUTCOME-WIRE: on the done transition, hand advanceTask the
  // work-products probe so a task that DECLARED a required outcome can only
  // close with a recorded artifact. No contract → the gate ignores the probe.
  const probe = a.taskStatus === "done" ? await resolveTaskArtifactProbe(a.taskId) : undefined;
  const result = advanceTask(task, a.taskStatus as TaskStatus, a.detail, probe);
  if (!result.ok) return { ok: false, output: result.error };
  await appendTask(result.value);
  return { ok: true, output: `task ${a.taskId} → ${a.taskStatus}${a.detail ? `: ${a.detail}` : ""}` };
}

async function doTasks(a: Parsed): Promise<ToolResult> {
  const recs = await readTasks();
  const tasks = a.workerId ? tasksForWorker(recs, a.workerId) : latestTasks(recs);
  if (!tasks.length) return { ok: true, output: "no tasks found" };
  const lines = tasks.map((t) => {
    const extra = t.result ? ` → ${t.result}` : t.blocker ? ` ⚠ ${t.blocker}` : "";
    return `${t.id} · ${t.workerId} · ${t.status} · ${t.title}${extra}`;
  });
  return { ok: true, output: lines.join("\n") };
}

function dispatchAction(a: Parsed, ctx: ToolContext): Promise<ToolResult> {
  if (a.action === "define") return doDefine(a);
  if (a.action === "status") return doStatus(a);
  if (a.action === "dispatch") return doDispatch(a);
  if (a.action === "advance") return doAdvance(a);
  if (a.action === "tasks") return doTasks(a);
  if (a.action === "run") return doRun(a.taskId, a.detail, ctx);
  return doList();
}

export const teamTool: Tool = {
  schema: {
    name: "team",
    description:
      "Worker roster + task ledger. " +
      "action:define — add/update a worker (id, role, model?, tools?, note?); " +
      "action:status — update worker status (id, status: idle|running|blocked|done); " +
      "action:list — list roster; " +
      "action:dispatch — assign a task to a worker (taskId, workerId, title); " +
      "action:advance — move a task to a new status (taskId, taskStatus: assigned|running|done|blocked, detail?); " +
      "action:tasks — list tasks (optional: workerId to filter); " +
      "action:run — actually execute a dispatched task by spawning a worker agent (taskId; optional detail = instruction), updating the task to done/blocked with the result.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["define", "status", "list", "dispatch", "advance", "tasks", "run"],
          description: "define worker | update worker status | list roster | dispatch task | advance task | list tasks | run task (spawn worker)",
        },
        id: { type: "string", description: "worker id (define/status)" },
        role: { type: "string", description: "worker role (define)" },
        model: { type: "string", description: "model id the worker runs on (define, optional)" },
        tools: { type: "array", items: { type: "string" }, description: "tool names (define, optional)" },
        note: { type: "string", description: "worker note (define, optional)" },
        status: { type: "string", enum: ["idle", "running", "blocked", "done"], description: "worker status (status action)" },
        taskId: { type: "string", description: "stable task id slug (dispatch/advance)" },
        workerId: { type: "string", description: "worker id target (dispatch/tasks)" },
        title: { type: "string", description: "task description (dispatch)" },
        taskStatus: { type: "string", enum: TASK_STATUSES, description: "target task status (advance)" },
        detail: { type: "string", description: "result or blocker text (advance, optional)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `team ${String(a.action ?? "")}`,
  async execute(raw, ctx) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "team needs action: define|status|list|dispatch|advance|tasks|run" };
    return dispatchAction(p.data, ctx);
  },
};
