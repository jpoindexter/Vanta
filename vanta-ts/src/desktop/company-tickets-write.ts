import { requireOutcome } from "../cofounder/outcome-contract.js";
import { advanceTask, assignTask, type WorkerTask } from "../team/tasks.js";
import { requireStage } from "../team/review-stage.js";
import { resolveTaskArtifactProbe } from "../tools/task-outcome-probe.js";
import { addComment, createTicket, setStatus, type Ticket, type TicketLinks } from "../tickets/store.js";
import type { z } from "zod";
import { recordActivity } from "./company-activity.js";
import { encodeComment } from "./company-comments.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { announce } from "./company-emit.js";
import { startRun, type StartResult } from "./company-run-engine.js";
import { isRunning } from "./company-run-state.js";
import type { TicketSummary } from "./company-schemas.js";
import { loadSnapshot, type CompanySnapshot } from "./company-snapshot.js";
import { persistTask, ticketDeps } from "./company-tasks.js";
import { buildSummary } from "./company-tickets.js";
import type { AnswerBody, AssignBody, CloseBody, CommentBody, CreateTicketBody } from "./company-write-schemas.js";

// Ticket writes. A ticket row (tickets.json) and its team task (team-tasks.jsonl)
// share an id; assignment creates the task, and every state change after that
// goes through advanceTask so the engine's outcome and review gates stay in force.

export type TicketWrite = { ticket: TicketSummary; changed: boolean; run?: StartResult };

const OWNER = "owner";
const REVIEW_STAGE = "owner-review";
const OUTPUT_LABEL = /^cfg:output=(.+)$/;
const NO_REVIEW_LABEL = "cfg:review=none";

async function summaryOf(ctx: CompanyCtx, id: string): Promise<TicketSummary> {
  return buildSummary(await loadSnapshot(ctx), id)!;
}

function nextTicketId(ids: string[]): string {
  const numbers = ids.map((id) => /^T-(\d+)$/.exec(id)?.[1]).filter((n): n is string => Boolean(n)).map(Number);
  return `T-${Math.max(0, ...numbers) + 1}`;
}

function ticketLabels(body: z.infer<typeof CreateTicketBody>): string[] {
  return [
    ...(body.labels ?? []),
    ...(body.requestId ? [`req:${body.requestId}`] : []),
    ...(body.expectedOutput ? [`cfg:output=${body.expectedOutput}`] : []),
    ...(body.requireReview ? [] : [NO_REVIEW_LABEL]),
  ];
}

function ticketLinks(body: z.infer<typeof CreateTicketBody>): TicketLinks {
  const pairs = [["goalId", body.goalId], ["parentId", body.parentId], ["projectId", body.projectId]] as const;
  return Object.fromEntries(pairs.filter(([, value]) => value !== undefined)) as TicketLinks;
}

export async function createTicketRoute(ctx: CompanyCtx, body: z.infer<typeof CreateTicketBody>): Promise<Outcome<TicketWrite>> {
  const snap = await loadSnapshot(ctx);
  const repeat = body.requestId ? snap.tickets.find((t) => t.labels.includes(`req:${body.requestId}`)) : undefined;
  if (repeat) return succeed({ ticket: await summaryOf(ctx, repeat.id), changed: false });
  if (body.parentId && !snap.tickets.some((t) => t.id === body.parentId)) return fail(400, `parentId: no ticket "${body.parentId}". GET /api/tickets lists tickets.`);
  const id = nextTicketId([...snap.tickets.map((t) => t.id), ...snap.tasks.map((t) => t.id)]);
  await createTicket(ctx.dataDir, { title: body.title, links: ticketLinks(body), labels: ticketLabels(body) }, { ...ticketDeps(ctx), id: () => id });
  if (body.description) await addComment(ctx.dataDir, id, encodeComment({ author: OWNER, text: body.description }), ticketDeps(ctx));
  await recordActivity(ctx, { kind: "ticket.created", actor: OWNER, summary: `created ${id}: ${body.title}`, refs: { ticketId: id } });
  await announce(ctx, { ticketId: id });
  return succeed({ ticket: await summaryOf(ctx, id), changed: true });
}

function newTaskFor(ctx: CompanyCtx, ticket: Ticket, tasks: WorkerTask[], workerId: string): Outcome<WorkerTask> {
  const made = assignTask(tasks, ticket.id, workerId, ticket.title);
  if (!made.ok) return fail(409, made.error);
  let task = made.value;
  const output = ticket.labels.map((l) => OUTPUT_LABEL.exec(l)?.[1]).find(Boolean);
  if (output) {
    const contract = requireOutcome(task, output);
    if (!contract.ok) return fail(400, contract.error);
    task = contract.value;
  }
  if (!ticket.labels.includes(NO_REVIEW_LABEL)) {
    const staged = requireStage(task, REVIEW_STAGE, OWNER);
    if (!staged.ok) return fail(409, staged.error);
    task = staged.value;
  }
  return succeed({ ...task, created: ctx.ports.now().toISOString(), updated: ctx.ports.now().toISOString() });
}

/** Create the task, or move a not-yet-started one to another worker. Returns whether anything changed. */
async function ensureAssignment(ctx: CompanyCtx, snap: CompanySnapshot, body: z.infer<typeof AssignBody>): Promise<Outcome<boolean>> {
  const ticket = snap.tickets.find((t) => t.id === body.ticketId);
  const existing = snap.tasks.find((t) => t.id === body.ticketId);
  if (!existing) {
    const task = newTaskFor(ctx, ticket!, snap.tasks, body.workerId);
    if (!task.ok) return task;
    await persistTask(ctx, task.value);
    return succeed(true);
  }
  if (existing.workerId === body.workerId) return succeed(false);
  if (existing.status !== "assigned" && existing.status !== "stopped") return fail(409, `ticket ${existing.id} is ${existing.status} with ${existing.workerId}; reassign only works before work starts`);
  await persistTask(ctx, { ...existing, workerId: body.workerId, updated: ctx.ports.now().toISOString() });
  return succeed(true);
}

function assignPreconditions(snap: CompanySnapshot, body: z.infer<typeof AssignBody>): Outcome<true> {
  const known = snap.tickets.some((t) => t.id === body.ticketId) || snap.tasks.some((t) => t.id === body.ticketId);
  if (!known) return fail(404, `no ticket "${body.ticketId}". Create it with POST /api/company/tickets/create.`);
  if (!snap.workers.some((w) => w.id === body.workerId)) return fail(404, `no worker "${body.workerId}". GET /api/company lists the roster.`);
  return succeed(true);
}

export async function assignTicket(ctx: CompanyCtx, body: z.infer<typeof AssignBody>): Promise<Outcome<TicketWrite>> {
  const snap = await loadSnapshot(ctx);
  const precondition = assignPreconditions(snap, body);
  if (!precondition.ok) return precondition;
  const assigned = await ensureAssignment(ctx, snap, body);
  if (!assigned.ok) return assigned;
  if (assigned.value) await recordActivity(ctx, { kind: "ticket.assigned", actor: OWNER, summary: `assigned ${body.ticketId} to ${body.workerId}`, refs: { ticketId: body.ticketId, workerId: body.workerId } });
  await announce(ctx, { ticketId: body.ticketId, workerId: body.workerId });
  const current = (await loadSnapshot(ctx)).tasks.find((t) => t.id === body.ticketId)!;
  const started = body.start && current.status === "assigned" ? await startRun(ctx, { taskId: body.ticketId }) : null;
  if (started && !started.ok) return started;
  return succeed({ ticket: await summaryOf(ctx, body.ticketId), changed: assigned.value, ...(started?.ok ? { run: started.value } : {}) });
}

/** Ensure a ticket row exists (a task made on the CLI has none), so it can carry a thread. */
async function ensureTicketRow(ctx: CompanyCtx, id: string): Promise<Outcome<true>> {
  const snap = await loadSnapshot(ctx);
  if (snap.tickets.some((t) => t.id === id)) return succeed(true);
  const task = snap.tasks.find((t) => t.id === id);
  if (!task) return fail(404, `no ticket "${id}". GET /api/tickets lists tickets.`);
  await createTicket(ctx.dataDir, { title: task.title }, { ...ticketDeps(ctx), id: () => id });
  return succeed(true);
}

export async function commentTicket(ctx: CompanyCtx, body: z.infer<typeof CommentBody>): Promise<Outcome<TicketWrite>> {
  const row = await ensureTicketRow(ctx, body.ticketId);
  if (!row.ok) return row;
  const ticket = (await loadSnapshot(ctx)).tickets.find((t) => t.id === body.ticketId)!;
  const marker = body.requestId ? `|r:${body.requestId}` : undefined;
  if (marker && ticket.comments.some((c) => c.text.includes(marker))) return succeed({ ticket: await summaryOf(ctx, body.ticketId), changed: false });
  await addComment(ctx.dataDir, body.ticketId, encodeComment({ author: OWNER, text: body.text, requestId: body.requestId }), ticketDeps(ctx));
  await recordActivity(ctx, { kind: "ticket.commented", actor: OWNER, summary: `commented on ${body.ticketId}`, refs: { ticketId: body.ticketId } });
  await announce(ctx, { ticketId: body.ticketId });
  return succeed({ ticket: await summaryOf(ctx, body.ticketId), changed: true });
}

export async function answerTicket(ctx: CompanyCtx, body: z.infer<typeof AnswerBody>): Promise<Outcome<TicketWrite>> {
  const snap = await loadSnapshot(ctx);
  const task = snap.tasks.find((t) => t.id === body.ticketId);
  if (!task) return fail(404, `no assigned ticket "${body.ticketId}". Only an assigned ticket can wait on an answer.`);
  if (task.status !== "blocked") return fail(409, `ticket ${task.id} is ${task.status}, not blocked, so there is no open question to answer`);
  const row = await ensureTicketRow(ctx, task.id);
  if (!row.ok) return row;
  await addComment(ctx.dataDir, task.id, encodeComment({ author: OWNER, kind: "answer", text: body.answer }), ticketDeps(ctx));
  await recordActivity(ctx, { kind: "ticket.answered", actor: OWNER, summary: `answered the blocker on ${task.id}`, refs: { ticketId: task.id, workerId: task.workerId } });
  const run = await startRun(ctx, { taskId: task.id, note: `The owner answered your blocker: ${body.answer}` });
  if (!run.ok) return run;
  return succeed({ ticket: await summaryOf(ctx, task.id), changed: true, run: run.value });
}

async function closeBare(ctx: CompanyCtx, body: z.infer<typeof CloseBody>): Promise<void> {
  await setStatus(ctx.dataDir, body.ticketId, body.resolution === "done" ? "done" : "closed", ticketDeps(ctx));
}

export async function closeTicket(ctx: CompanyCtx, body: z.infer<typeof CloseBody>): Promise<Outcome<TicketWrite>> {
  const snap = await loadSnapshot(ctx);
  const task = snap.tasks.find((t) => t.id === body.ticketId);
  if (!task && !snap.tickets.some((t) => t.id === body.ticketId)) return fail(404, `no ticket "${body.ticketId}". GET /api/tickets lists tickets.`);
  if (task && isRunning(ctx.home, task.id)) return fail(409, `ticket ${task.id} has a run in flight; wait for it to finish or pause the worker first`);
  const target = body.resolution === "done" ? "done" : "removed";
  if (!task) await closeBare(ctx, body);
  else if (task.status !== target) {
    const closed = await closeTask(ctx, task, { target, noArtifactReason: body.noArtifactReason });
    if (!closed.ok) return closed;
  }
  await recordActivity(ctx, { kind: "ticket.closed", actor: OWNER, summary: `closed ${body.ticketId} as ${body.resolution}`, refs: { ticketId: body.ticketId, ...(task ? { workerId: task.workerId } : {}) } });
  await announce(ctx, { ticketId: body.ticketId, workerId: task?.workerId });
  return succeed({ ticket: await summaryOf(ctx, body.ticketId), changed: true });
}

const NOT_STARTED = new Set<WorkerTask["status"]>(["assigned", "blocked", "stopped"]);

/** Done needs a running task: step there first, then let advanceTask apply the outcome and review gates. */
async function stepToRunning(task: WorkerTask): Promise<Outcome<WorkerTask>> {
  if (!NOT_STARTED.has(task.status)) return succeed(task);
  const started = advanceTask(task, "running");
  return started.ok ? succeed(started.value) : fail(409, started.error);
}

async function closeTask(ctx: CompanyCtx, task: WorkerTask, opts: { target: "done" | "removed"; noArtifactReason?: string }): Promise<Outcome<true>> {
  const forced = opts.noArtifactReason && task.outcome ? { ...task, outcome: { ...task.outcome, noArtifactReason: opts.noArtifactReason } } : task;
  const ready = opts.target === "done" ? await stepToRunning(forced) : succeed(forced);
  if (!ready.ok) return ready;
  const probe = opts.target === "done" ? await resolveTaskArtifactProbe(ready.value.id, ctx.env) : undefined;
  const moved = advanceTask(ready.value, opts.target, opts.target === "done" ? "closed by owner" : "closed without doing", probe);
  if (!moved.ok) return fail(409, moved.error);
  await persistTask(ctx, moved.value);
  return succeed(true);
}
