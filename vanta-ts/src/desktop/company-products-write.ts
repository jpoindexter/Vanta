import { approveArtifact, appendRevision, requestRevision, type ReviewDeps } from "../cofounder/outcome-approval.js";
import { bySourceTask, readWorkProducts, setApproved, writeWorkProducts, type WorkProduct } from "../cofounder/work-products.js";
import { blockingStages, decideStage } from "../team/review-stage.js";
import { advanceTask, type WorkerTask } from "../team/tasks.js";
import { resolveTaskArtifactProbe } from "../tools/task-outcome-probe.js";
import { recordActivity } from "./company-activity.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { announce } from "./company-emit.js";
import { productView } from "./company-products.js";
import { startRun, type StartResult } from "./company-run-engine.js";
import { isRunning } from "./company-run-state.js";
import type { TicketSummary, WorkProductView } from "./company-schemas.js";
import { loadSnapshot } from "./company-snapshot.js";
import { persistTask } from "./company-tasks.js";
import { buildSummary } from "./company-tickets.js";

// Approve or send back a worker's artifact (COFOUNDER-OUTCOME-APPROVAL). The
// owner's approval is also the decision on the ticket's "owner-review" stage
// (PCLIP-APPROVAL-STAGES), which is what lets the ticket close. Closing still
// goes through advanceTask, so the outcome gate applies as it does everywhere.

export type ProductWrite = {
  workProduct: WorkProductView;
  ticket: TicketSummary | null;
  changed: boolean;
  closed?: boolean;
  closeBlockedBy?: string;
  run?: StartResult;
};

const OWNER = "owner";

const reviewDeps = (ctx: CompanyCtx, rerunTask: ReviewDeps["rerunTask"]): ReviewDeps => ({
  setApproved: async (id, approved) => {
    const result = setApproved(await readWorkProducts(ctx.env), id, approved);
    if (result.ok) await writeWorkProducts(result.value, ctx.env);
    return result;
  },
  rerunTask,
  appendRevision: (record) => appendRevision(record, ctx.env),
  now: ctx.ports.now,
});

async function decideOwnerStages(ctx: CompanyCtx, task: WorkerTask, decision: { approve: boolean; reason?: string }): Promise<WorkerTask> {
  let current = task;
  for (const stage of task.reviewStages ?? []) {
    if (stage.reviewerId !== OWNER || (decision.approve && stage.status === "approved")) continue;
    const decided = decideStage(current, { name: stage.name, approve: decision.approve, by: OWNER, reason: decision.reason, now: ctx.ports.now() });
    if (decided.ok) current = decided.value;
  }
  if (current !== task) await persistTask(ctx, current);
  return current;
}

async function closeIfReady(ctx: CompanyCtx, task: WorkerTask): Promise<{ closed: boolean; blockedBy?: string }> {
  if (task.status !== "running") return { closed: task.status === "done" };
  if (isRunning(ctx.home, task.id)) return { closed: false, blockedBy: "a run is still in flight; it closes the ticket when it finishes" };
  if (blockingStages(task).length) return { closed: false, blockedBy: "other review stages are still open" };
  const done = advanceTask(task, "done", task.result ?? "approved by owner", await resolveTaskArtifactProbe(task.id, ctx.env));
  if (!done.ok) return { closed: false, blockedBy: done.error };
  await persistTask(ctx, done.value);
  return { closed: true };
}

async function viewFor(ctx: CompanyCtx, productId: string): Promise<{ view: WorkProductView; ticket: TicketSummary | null }> {
  const snap = await loadSnapshot(ctx);
  const product = snap.products.find((p) => p.id === productId)!;
  return { view: productView(product, snap.revisions), ticket: buildSummary(snap, product.sourceTaskId) };
}

async function settleApproval(ctx: CompanyCtx, task: WorkerTask | undefined, siblings: WorkProduct[]): Promise<{ closed: boolean; blockedBy?: string }> {
  if (!task || !siblings.every((p) => p.approved)) return { closed: false };
  return closeIfReady(ctx, await decideOwnerStages(ctx, task, { approve: true }));
}

export async function approveProduct(ctx: CompanyCtx, workProductId: string): Promise<Outcome<ProductWrite>> {
  const snap = await loadSnapshot(ctx);
  const product = snap.products.find((p) => p.id === workProductId);
  if (!product) return fail(404, `no work product "${workProductId}". GET /api/work-products lists them.`);
  const approved = await approveArtifact(workProductId, reviewDeps(ctx, async () => {}));
  if (!approved.ok) return fail(400, approved.error);
  if (!product.approved) await recordActivity(ctx, { kind: "work_product.approved", actor: OWNER, summary: `approved ${workProductId}`, refs: { ticketId: product.sourceTaskId, workProductId } });
  const task = snap.tasks.find((t) => t.id === product.sourceTaskId);
  const closure = await settleApproval(ctx, task, bySourceTask(approved.value, product.sourceTaskId));
  if (closure.closed && task?.status !== "done") await recordActivity(ctx, { kind: "ticket.closed", actor: OWNER, summary: `${product.sourceTaskId} closed after approval`, refs: { ticketId: product.sourceTaskId, workerId: product.producedBy } });
  await announce(ctx, { ticketId: product.sourceTaskId, workerId: product.producedBy });
  const { view, ticket } = await viewFor(ctx, workProductId);
  return succeed({ workProduct: view, ticket, changed: !product.approved || (closure.closed && task?.status !== "done"), closed: closure.closed, ...(closure.blockedBy ? { closeBlockedBy: closure.blockedBy } : {}) });
}

export async function reviseProduct(ctx: CompanyCtx, input: { workProductId: string; reason: string }): Promise<Outcome<ProductWrite>> {
  const snap = await loadSnapshot(ctx);
  const product = snap.products.find((p) => p.id === input.workProductId);
  if (!product) return fail(404, `no work product "${input.workProductId}". GET /api/work-products lists them.`);
  const task = snap.tasks.find((t) => t.id === product.sourceTaskId);
  if (task && (task.status === "done" || task.status === "removed")) return fail(409, `ticket ${task.id} is ${task.status}, so its worker cannot revise. Create a follow-up ticket instead.`);
  if (task) await decideOwnerStages(ctx, task, { approve: false, reason: input.reason });
  let run: StartResult = { started: false, reason: "no task to re-run" };
  const rerun: ReviewDeps["rerunTask"] = async (taskId) => {
    const started = await startRun(ctx, { taskId, note: `Revision requested: ${input.reason}`, reviseProductId: product.id });
    run = started.ok ? started.value : { started: false, reason: started.error };
  };
  const revised = await requestRevision(input.workProductId, input.reason, snap.products, reviewDeps(ctx, rerun));
  if (!revised.ok) return fail(400, revised.error);
  await recordActivity(ctx, { kind: "work_product.revision_requested", actor: OWNER, summary: `requested a revision of ${product.id}: ${input.reason}`, refs: { ticketId: product.sourceTaskId, workProductId: product.id } });
  await announce(ctx, { ticketId: product.sourceTaskId, workerId: product.producedBy });
  const { view, ticket } = await viewFor(ctx, product.id);
  return succeed({ workProduct: view, ticket, changed: true, run });
}
