import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import { appendTeam, readTeam, latestWorkers, type Worker } from "../team/store.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";
import {
  appendTask,
  readTasks,
  latestTasks,
  assignTask,
  advanceTask,
  tasksForWorker,
  workerLoad,
  type TaskStatus,
  type WorkerTask,
} from "../team/tasks.js";

const TASK_STATUSES = ["assigned", "running", "done", "blocked"] as const;
const WORKER_MAX_ITER = 20;

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
  const result = advanceTask(task, a.taskStatus as TaskStatus, a.detail);
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

/** Move a task to a new status from an assumed-current `from`, best-effort. */
async function settle(task: WorkerTask, from: TaskStatus, to: TaskStatus, detail?: string): Promise<void> {
  const r = advanceTask({ ...task, status: from }, to, detail);
  if (r.ok) await appendTask(r.value);
}

// Live executor: actually run a dispatched task by spawning a worker agent.
// The child registry excludes delegate + team so a worker can't fan out further
// (no recursive teams); every worker tool call is still kernel-gated.
async function doRun(a: Parsed, ctx: ToolContext): Promise<ToolResult> {
  if (!a.taskId) return { ok: false, output: "run needs taskId (dispatch the task first)" };
  const task = latestTasks(await readTasks()).find((t) => t.id === a.taskId);
  if (!task) return { ok: false, output: `unknown task id "${a.taskId}" — dispatch it first` };
  if (task.status === "done") return { ok: false, output: `task ${a.taskId} already done` };

  let provider;
  try {
    provider = resolveProvider(process.env);
  } catch (err) {
    return { ok: false, output: `cannot run: ${(err as Error).message}` };
  }

  await settle(task, "assigned", "running");
  try {
    const outcome = await spawnSubagent({
      goal: task.title,
      instruction: a.detail ?? `Complete this task: ${task.title}`,
      deps: {
        provider,
        safety: ctx.safety,
        registry: buildRegistry({ exclude: ["delegate", "team"] }),
        root: ctx.root,
        requestApproval: ctx.requestApproval,
        maxIterations: WORKER_MAX_ITER,
      },
      maxIterations: WORKER_MAX_ITER,
    });
    const result = (outcome.finalText ?? "").slice(0, 500) || `(worker ${outcome.stoppedReason})`;
    await settle(task, "running", "done", result);
    return { ok: true, output: `task ${a.taskId} done by ${task.workerId}: ${result}` };
  } catch (err) {
    const msg = (err as Error).message;
    await settle(task, "running", "blocked", msg);
    return { ok: false, output: `task ${a.taskId} blocked: ${msg}` };
  }
}

function dispatchAction(a: Parsed, ctx: ToolContext): Promise<ToolResult> {
  if (a.action === "define") return doDefine(a);
  if (a.action === "status") return doStatus(a);
  if (a.action === "dispatch") return doDispatch(a);
  if (a.action === "advance") return doAdvance(a);
  if (a.action === "tasks") return doTasks(a);
  if (a.action === "run") return doRun(a, ctx);
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
