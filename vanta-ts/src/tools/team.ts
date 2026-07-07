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
import { requireStage, decideStage, reviewQueue } from "../team/review-stage.js";
import { planDelegateDown, planEscalateUp } from "../team/delegation.js";
import { readWorkProducts, recordWorkProduct, bySourceTask, WORK_PRODUCT_KINDS, type WorkProductKind } from "../cofounder/work-products.js";
import { resolveTaskArtifactProbe } from "./task-outcome-probe.js";

const TASK_STATUSES = ["assigned", "running", "done", "blocked"] as const;

const Args = z.object({
  action: z.enum(["define", "status", "list", "dispatch", "advance", "tasks", "run", "require_review", "review", "reviews", "artifact", "artifacts", "delegate_down", "escalate_up"]),
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
  // PCLIP-APPROVAL-STAGES fields
  stage: z.string().optional(),
  reviewerId: z.string().optional(),
  approve: z.boolean().optional(),
  // PCLIP-WORK-PRODUCTS fields
  artifact: z.string().optional(),
  artifactKind: z.enum(WORK_PRODUCT_KINDS).optional(),
  // PCLIP-DELEGATION-UPDOWN fields
  managerId: z.string().optional(),
  reportId: z.string().optional(),
  blocker: z.string().optional(),
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
  // PCLIP-WORK-PRODUCTS: linked artifacts are visible from the listing itself.
  const products = await readWorkProducts().catch(() => []);
  const lines = tasks.map((t) => {
    const extra = t.result ? ` → ${t.result}` : t.blocker ? ` ⚠ ${t.blocker}` : "";
    const n = bySourceTask(products, t.id).length;
    return `${t.id} · ${t.workerId} · ${t.status} · ${t.title}${extra}${n ? ` · ${n} artifact(s)` : ""}`;
  });
  return { ok: true, output: lines.join("\n") };
}

/** PCLIP-WORK-PRODUCTS — record an artifact (file/preview/deploy ref) on a task. */
async function doArtifact(a: Parsed): Promise<ToolResult> {
  if (!a.taskId || !a.artifact) return { ok: false, output: "artifact needs taskId, artifact (path/url/content ref); optional artifactKind" };
  const task = latestTasks(await readTasks()).find((t) => t.id === a.taskId);
  if (!task) return { ok: false, output: `unknown task id "${a.taskId}" — dispatch it first` };
  const existing = await readWorkProducts().catch(() => []);
  const r = recordWorkProduct(existing, {
    artifact: a.artifact,
    kind: a.artifactKind as WorkProductKind | undefined,
    sourceTaskId: task.id,
    departmentId: "team",
    producedBy: task.workerId,
  });
  if (!r.ok) return { ok: false, output: r.error };
  const { writeWorkProducts } = await import("../cofounder/work-products.js");
  await writeWorkProducts([...existing, r.value]);
  return { ok: true, output: `task ${task.id}: artifact recorded (${r.value.kind}) — ${a.artifact.slice(0, 80)}` };
}

/** PCLIP-WORK-PRODUCTS — view a task's linked artifacts without the transcript. */
async function doArtifacts(a: Parsed): Promise<ToolResult> {
  if (!a.taskId) return { ok: false, output: "artifacts needs taskId" };
  const linked = bySourceTask(await readWorkProducts().catch(() => []), a.taskId);
  if (!linked.length) return { ok: true, output: `task ${a.taskId}: no linked artifacts` };
  const lines = linked.map((p) => `[${p.kind}] ${p.approved ? "✓" : "·"} ${p.artifact} (by ${p.producedBy})`);
  return { ok: true, output: lines.join("\n") };
}

/** PCLIP-APPROVAL-STAGES — load a task by id, apply a pure stage transition, persist. */
async function withTask(taskId: string | undefined, apply: (t: import("../team/tasks.js").WorkerTask) => import("../team/tasks.js").TaskResult<import("../team/tasks.js").WorkerTask>): Promise<ToolResult> {
  if (!taskId) return { ok: false, output: "needs taskId" };
  const task = latestTasks(await readTasks()).find((t) => t.id === taskId);
  if (!task) return { ok: false, output: `unknown task id "${taskId}" — dispatch it first` };
  const result = apply(task);
  if (!result.ok) return { ok: false, output: result.error };
  await appendTask(result.value);
  return { ok: true, output: "" };
}

async function doRequireReview(a: Parsed): Promise<ToolResult> {
  if (!a.stage || !a.reviewerId) return { ok: false, output: "require_review needs taskId, stage, reviewerId" };
  const r = await withTask(a.taskId, (t) => requireStage(t, a.stage!, a.reviewerId!));
  return r.ok ? { ok: true, output: `task ${a.taskId}: review stage "${a.stage}" required, routed to ${a.reviewerId}` } : r;
}

async function doReview(a: Parsed): Promise<ToolResult> {
  if (!a.stage || a.approve === undefined || !a.reviewerId) {
    return { ok: false, output: "review needs taskId, stage, approve (true|false), reviewerId (who decides); optional detail = reason" };
  }
  const r = await withTask(a.taskId, (t) => decideStage(t, { name: a.stage!, approve: a.approve!, by: a.reviewerId!, reason: a.detail }));
  return r.ok ? { ok: true, output: `task ${a.taskId}: stage "${a.stage}" ${a.approve ? "approved" : "rejected"} by ${a.reviewerId}` } : r;
}

async function doReviews(a: Parsed): Promise<ToolResult> {
  if (!a.reviewerId) return { ok: false, output: "reviews needs reviewerId" };
  const queue = reviewQueue(latestTasks(await readTasks()), a.reviewerId);
  if (!queue.length) return { ok: true, output: `no pending reviews for ${a.reviewerId}` };
  return { ok: true, output: queue.map((q) => `${q.taskId} · stage "${q.stage.name}" · ${q.title}`).join("\n") };
}

/** PCLIP-DELEGATION-UPDOWN — a manager assigns a subtask DOWN to a report (ledger task). */
async function doDelegateDown(a: Parsed): Promise<ToolResult> {
  if (!a.managerId || !a.reportId || !a.taskId || !a.title) return { ok: false, output: "delegate_down needs managerId, reportId, taskId, title" };
  const plan = planDelegateDown(latestWorkers(await readTeam()), { managerId: a.managerId, reportId: a.reportId, taskId: a.taskId, title: a.title });
  if (!plan.ok) return { ok: false, output: plan.error };
  const assigned = assignTask(await readTasks(), plan.task.taskId, plan.task.workerId, plan.task.title);
  if (!assigned.ok) return { ok: false, output: assigned.error };
  await appendTask(assigned.value);
  return { ok: true, output: `delegated ${plan.task.taskId} down: ${a.managerId} → ${plan.task.workerId}: ${plan.task.title}` };
}

/** PCLIP-DELEGATION-UPDOWN — a report escalates a blocker UP to its manager (ledger task). */
async function doEscalateUp(a: Parsed): Promise<ToolResult> {
  if (!a.id || !a.taskId || !a.blocker) return { ok: false, output: "escalate_up needs id (the escalating worker), taskId, blocker" };
  const plan = planEscalateUp(latestWorkers(await readTeam()), { fromId: a.id, taskId: a.taskId, blocker: a.blocker });
  if (!plan.ok) return { ok: false, output: plan.error };
  const assigned = assignTask(await readTasks(), plan.task.taskId, plan.task.workerId, plan.task.title);
  if (!assigned.ok) return { ok: false, output: assigned.error };
  await appendTask(assigned.value);
  return { ok: true, output: `escalated ${plan.task.taskId} up: ${a.id} → ${plan.task.workerId}: ${a.blocker}` };
}

const ACTIONS: Record<string, (a: Parsed, ctx: ToolContext) => Promise<ToolResult>> = {
  define: (a) => doDefine(a),
  status: (a) => doStatus(a),
  dispatch: (a) => doDispatch(a),
  advance: (a) => doAdvance(a),
  tasks: (a) => doTasks(a),
  run: (a, ctx) => doRun(a.taskId, a.detail, ctx),
  require_review: (a) => doRequireReview(a),
  review: (a) => doReview(a),
  reviews: (a) => doReviews(a),
  artifact: (a) => doArtifact(a),
  artifacts: (a) => doArtifacts(a),
  delegate_down: (a) => doDelegateDown(a),
  escalate_up: (a) => doEscalateUp(a),
};

function dispatchAction(a: Parsed, ctx: ToolContext): Promise<ToolResult> {
  return (ACTIONS[a.action] ?? (() => doList()))(a, ctx);
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
      "action:run — actually execute a dispatched task by spawning a worker agent (taskId; optional detail = instruction), updating the task to done/blocked with the result; " +
      "action:require_review — add a named review stage that BLOCKS the task's done transition until approved (taskId, stage, reviewerId); " +
      "action:review — approve/reject a stage (taskId, stage, approve, reviewerId = who decides, detail? = reason); " +
      "action:reviews — list pending review stages routed to a reviewer (reviewerId); " +
      "action:artifact — record a work-product artifact (file path/preview url/deploy ref) on a task (taskId, artifact, artifactKind?); " +
      "action:artifacts — list a task's linked artifacts without reading the transcript (taskId); " +
      "action:delegate_down — a manager assigns a subtask to a direct report (managerId, reportId, taskId, title); " +
      "action:escalate_up — a report escalates a blocker to its manager (id = the worker, taskId, blocker).",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["define", "status", "list", "dispatch", "advance", "tasks", "run", "require_review", "review", "reviews", "artifact", "artifacts", "delegate_down", "escalate_up"],
          description: "define worker | update worker status | list roster | dispatch task | advance task | list tasks | run task (spawn worker) | require review stage | decide review | list pending reviews",
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
        detail: { type: "string", description: "result or blocker text (advance, optional); review reason (review, optional)" },
        stage: { type: "string", description: "review stage name (require_review/review)" },
        reviewerId: { type: "string", description: "reviewer the stage routes to (require_review/reviews) or who decides (review)" },
        approve: { type: "boolean", description: "review decision (review): true approves, false rejects" },
        artifact: { type: "string", description: "work-product ref — file path, preview/deploy url, or content (artifact action)" },
        artifactKind: { type: "string", enum: [...WORK_PRODUCT_KINDS], description: "artifact category (artifact action, default document)" },
        managerId: { type: "string", description: "delegating manager id (delegate_down)" },
        reportId: { type: "string", description: "target report id (delegate_down)" },
        blocker: { type: "string", description: "blocker text to escalate (escalate_up)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => `team ${String(a.action ?? "")}`,
  async execute(raw, ctx) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "team needs action: define|status|list|dispatch|advance|tasks|run|require_review|review|reviews|artifact|artifacts" };
    return dispatchAction(p.data, ctx);
  },
};
