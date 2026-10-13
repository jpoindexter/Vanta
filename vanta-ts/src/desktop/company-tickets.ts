import { blockingStages } from "../team/review-stage.js";
import type { WorkerTask } from "../team/tasks.js";
import type { Ticket } from "../tickets/store.js";
import { bySourceTask } from "../cofounder/work-products.js";
import { redactForLog } from "../store/redact-structural.js";
import type { Goal } from "../types.js";
import { decodeComment } from "./company-comments.js";
import { productViews } from "./company-products.js";
import type { CompanySnapshot } from "./company-snapshot.js";
import type { AncestryNode, TicketDetail, TicketSummary, TicketViewStatus } from "./company-schemas.js";

// A ticket (tickets.json, project data dir) and a team task (team-tasks.jsonl,
// Vanta home) are two stores for one unit of work. They share an id: assigning a
// ticket creates the task with the ticket's id. A task created elsewhere (the
// `team dispatch` tool) appears as a ticket with source "team-task".

const TEXT_MAX = 1000;
const ANCESTRY_MAX_DEPTH = 8;
const INTERNAL_LABEL = /^(req|cfg):/;

const clip = (text: string): string => redactForLog(text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text);

export function viewStatus(ticket: Ticket | undefined, task: WorkerTask | undefined): TicketViewStatus {
  if (task) {
    if (task.status === "removed") return "closed";
    if (task.status === "done") return "done";
    if (task.status === "blocked" || task.status === "stopped") return "blocked";
    if (task.status === "assigned") return "assigned";
    return blockingStages(task).length > 0 ? "in_review" : "in_progress";
  }
  if (!ticket) return "open";
  return ticket.status;
}

const isOpenBlock = (task: WorkerTask | undefined): boolean => task?.status === "blocked" || task?.status === "stopped";

function taskFields(snap: CompanySnapshot, id: string, task: WorkerTask | undefined): Pick<TicketSummary, "workerId" | "blocker" | "result" | "pendingReviews" | "workProductCount"> {
  return {
    workerId: task?.workerId ?? null,
    blocker: task?.blocker && isOpenBlock(task) ? clip(task.blocker) : null,
    result: task?.result ? clip(task.result) : null,
    pendingReviews: task ? blockingStages(task).filter((s) => s.status === "pending").length : 0,
    workProductCount: bySourceTask(snap.products, id).length,
  };
}

function ticketFields(ticket: Ticket | undefined): Pick<TicketSummary, "projectId" | "goalId" | "parentId" | "labels" | "inbox" | "commentCount"> {
  return {
    projectId: ticket?.links.projectId ?? null,
    goalId: ticket?.links.goalId ?? null,
    parentId: ticket?.links.parentId ?? null,
    labels: (ticket?.labels ?? []).filter((l) => !INTERNAL_LABEL.test(l)),
    inbox: ticket?.inbox ?? null,
    commentCount: ticket?.comments.length ?? 0,
  };
}

export function buildSummary(snap: CompanySnapshot, id: string): TicketSummary | null {
  const ticket = snap.tickets.find((t) => t.id === id);
  const task = snap.tasks.find((t) => t.id === id);
  if (!ticket && !task) return null;
  const createdAt = ticket?.createdAt ?? task!.created;
  const updatedAt = [ticket?.updatedAt, task?.updated].filter((v): v is string => Boolean(v)).sort().at(-1) ?? createdAt;
  return {
    id,
    title: clip(ticket?.title ?? task!.title),
    status: viewStatus(ticket, task),
    source: ticket && task ? "both" : ticket ? "ticket" : "team-task",
    ...taskFields(snap, id, task),
    ...ticketFields(ticket),
    createdAt,
    updatedAt,
  };
}

export function buildSummaries(snap: CompanySnapshot): TicketSummary[] {
  const ids = new Set([...snap.tickets.map((t) => t.id), ...snap.tasks.filter((t) => t.status !== "removed" || snap.tickets.some((k) => k.id === t.id)).map((t) => t.id)]);
  return [...ids]
    .map((id) => buildSummary(snap, id))
    .filter((s): s is TicketSummary => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

function threadOf(snap: CompanySnapshot, ticket: Ticket | undefined, task: WorkerTask | undefined, id: string): TicketDetail["thread"] {
  const comments = (ticket?.comments ?? []).map((c) => {
    const d = decodeComment(c.text);
    return { at: c.at, author: d.author, kind: d.kind, text: clip(d.text) };
  });
  const decisions = (task?.reviewStages ?? []).flatMap((s) =>
    s.decidedAt ? [{ at: s.decidedAt, author: s.decidedBy ?? s.reviewerId, kind: "event" as const, text: `review stage "${s.name}" ${s.status}${s.reason ? `: ${clip(s.reason)}` : ""}` }] : []);
  const revisions = bySourceTask(snap.products, id).flatMap((p) =>
    snap.revisions.filter((r) => r.workProductId === p.id).map((r) => ({ at: r.at, author: "owner", kind: "event" as const, text: `revision requested on ${p.id}: ${clip(r.reason)}` })));
  return [...comments, ...decisions, ...revisions].sort((a, b) => a.at.localeCompare(b.at));
}

function outcomeMissing(task: WorkerTask, hasArtifact: boolean): string | null {
  const contract = task.outcome;
  if (!contract || contract.noArtifactReason || hasArtifact) return null;
  return `no "${contract.expectedOutput}" artifact recorded yet`;
}

function blockersOf(task: WorkerTask | undefined, hasArtifact: boolean): TicketDetail["blockers"] {
  if (!task || task.status === "done" || task.status === "removed") return [];
  const out: TicketDetail["blockers"] = [];
  if (task.blocker && isOpenBlock(task)) out.push({ kind: "blocker", text: clip(task.blocker) });
  for (const s of blockingStages(task)) out.push({ kind: "review", text: `review stage "${s.name}" is ${s.status}; reviewer ${s.reviewerId}` });
  const missing = outcomeMissing(task, hasArtifact);
  if (missing) out.push({ kind: "outcome", text: missing });
  return out;
}

function ancestryOf(snap: CompanySnapshot, ticket: Ticket | undefined, goals: Goal[]): AncestryNode[] {
  const chain: AncestryNode[] = [];
  const seen = new Set<string>();
  let goalId = ticket?.links.goalId;
  let current = ticket;
  for (let depth = 0; current?.links.parentId && depth < ANCESTRY_MAX_DEPTH; depth += 1) {
    const parentId = current.links.parentId;
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = snap.tickets.find((t) => t.id === parentId);
    chain.push({ kind: "ticket", id: parentId, title: parent ? clip(parent.title) : null, status: parent?.status ?? null, resolved: Boolean(parent) });
    goalId ??= parent?.links.goalId;
    current = parent;
  }
  if (goalId) {
    const goal = goals.find((g) => String(g.id) === goalId);
    chain.push({ kind: "goal", id: goalId, title: goal ? clip(goal.text) : null, status: goal?.status ?? null, resolved: Boolean(goal) });
  }
  const projectId = ticket?.links.projectId;
  if (projectId) chain.push({ kind: "project", id: projectId, title: null, status: null, resolved: false });
  return chain;
}

export function buildDetail(snap: CompanySnapshot, id: string, goals: Goal[]): TicketDetail | null {
  const summary = buildSummary(snap, id);
  if (!summary) return null;
  const ticket = snap.tickets.find((t) => t.id === id);
  const task = snap.tasks.find((t) => t.id === id);
  const products = bySourceTask(snap.products, id);
  return {
    ...summary,
    thread: threadOf(snap, ticket, task, id),
    blockers: blockersOf(task, products.length > 0),
    runs: snap.runs.filter((r) => r.ticketId === id),
    workProducts: productViews(products, snap.revisions),
    ancestry: ancestryOf(snap, ticket, goals),
    reviewStages: (task?.reviewStages ?? []).map((s) => ({
      name: s.name, reviewerId: s.reviewerId, status: s.status,
      decidedBy: s.decidedBy ?? null, reason: s.reason ? clip(s.reason) : null, decidedAt: s.decidedAt ?? null,
    })),
    outcome: task?.outcome
      ? { expectedOutput: task.outcome.expectedOutput, satisfiedBy: task.outcome.satisfiedBy ?? null, noArtifactReason: task.outcome.noArtifactReason ?? null }
      : null,
    attachments: ticket?.attachments ?? [],
  };
}
