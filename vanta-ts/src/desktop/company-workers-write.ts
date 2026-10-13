import { setBudgetLimit } from "../budget/store.js";
import { readDepartments, writeDepartments } from "../cofounder/department.js";
import { setManager } from "../team/org-chart.js";
import { hireAgent } from "../team/hire.js";
import { appendTeam, type Worker } from "../team/store.js";
import type { z } from "zod";
import { recordActivity } from "./company-activity.js";
import { requireOwnerApproval } from "./company-approval.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { announce } from "./company-emit.js";
import { drainWorker } from "./company-run-engine.js";
import { abortWorker } from "./company-run-state.js";
import { buildWorker, isPaused } from "./company-roster.js";
import type { CompanyWorker } from "./company-schemas.js";
import { withCompanyLock } from "./company-lock.js";
import { loadSnapshot, type CompanySnapshot } from "./company-snapshot.js";
import type { HireBody } from "./company-write-schemas.js";

// Hire, pause and resume. The roster, org chart and department stores are the
// engine's own (team/hire.ts, org-chart.ts, department.ts); this layer only
// validates, asks for approval where authority grows, and records the change.

export type WorkerWrite = { worker: CompanyWorker; changed: boolean };

const requestIdOf = (worker: Worker): string | undefined => {
  const value = (worker as Record<string, unknown>).requestId;
  return typeof value === "string" ? value : undefined;
};

async function viewOf(ctx: CompanyCtx, workerId: string): Promise<CompanyWorker> {
  const snap = await loadSnapshot(ctx);
  return buildWorker(snap, snap.workers.find((w) => w.id === workerId)!);
}

async function addToDepartment(ctx: CompanyCtx, departmentId: string, workerId: string): Promise<void> {
  const departments = await readDepartments(ctx.env);
  await writeDepartments(departments.map((d) => (d.id === departmentId && !d.workerIds.includes(workerId)
    ? { ...d, workerIds: [...d.workerIds, workerId], updatedAt: ctx.ports.now().toISOString() }
    : d)), ctx.env);
}

type Hire = Extract<ReturnType<typeof hireAgent>, { ok: true }>;
type HireBodyT = z.infer<typeof HireBody>;

/** Everything that can reject a hire, checked before the owner is asked to approve. */
function validateHire(snap: CompanySnapshot, body: HireBodyT): Outcome<Hire> {
  if (body.managerId && !snap.workers.some((w) => w.id === body.managerId)) return fail(400, `managerId: no worker "${body.managerId}" on the roster`);
  if (body.departmentId && !snap.departments.some((d) => d.id === body.departmentId)) return fail(400, `departmentId: no department "${body.departmentId}". Create it with vanta dept add.`);
  const hired = hireAgent(snap.workers, { role: body.role, adapter: body.adapter, budgetUsd: body.budgetUsd, title: body.title });
  return hired.ok ? succeed(hired) : fail(400, `${hired.error}. GET /api/models lists provider ids.`);
}

async function persistHire(ctx: CompanyCtx, snap: CompanySnapshot, hired: Hire, body: HireBodyT): Promise<Outcome<true>> {
  let agent = hired.agent;
  if (body.managerId) {
    const managed = setManager([...snap.workers, agent], agent.id, body.managerId);
    if (!managed.ok) return fail(400, managed.error);
    agent = managed.roster.find((w) => w.id === agent.id)!;
  }
  await appendTeam({ ...agent, ...(body.requestId ? { requestId: body.requestId } : {}) }, ctx.env);
  if (body.departmentId) await addToDepartment(ctx, body.departmentId, agent.id);
  if (body.budgetUsd !== undefined) await setBudgetLimit(ctx.dataDir, { scope: `agent:${agent.id}`, limitUsd: body.budgetUsd, now: ctx.ports.now() });
  return succeed(true);
}

/** Not locked as a whole: the approval wait must not hold the company lock. */
export async function hireWorker(ctx: CompanyCtx, body: HireBodyT): Promise<Outcome<WorkerWrite>> {
  const snap = await withCompanyLock(ctx.home, () => loadSnapshot(ctx));
  const repeat = body.requestId ? snap.workers.find((w) => requestIdOf(w) === body.requestId) : undefined;
  if (repeat) return succeed({ worker: buildWorker(snap, repeat), changed: false });
  const valid = validateHire(snap, body);
  if (!valid.ok) return valid;
  const agent = valid.value.agent;
  const budget = body.budgetUsd === undefined ? "no budget cap" : `budget ${body.budgetUsd} USD`;
  const approval = await requireOwnerApproval(ctx, { tool: "company.hire", action: `Hire ${agent.id} (${body.role}) on ${body.adapter}`, reason: `Adds a worker that can run tickets with ${budget}.` });
  if (!approval.ok) return approval;
  return withCompanyLock(ctx.home, async () => {
    const saved = await persistHire(ctx, snap, valid.value, body);
    if (!saved.ok) return saved;
    await recordActivity(ctx, { kind: "worker.hired", actor: "owner", summary: `hired ${agent.id} (${body.role}) on ${body.adapter}, ${budget}`, refs: { workerId: agent.id } });
    await announce(ctx, { workerId: agent.id });
    return succeed({ worker: await viewOf(ctx, agent.id), changed: true });
  });
}

/** Pause or resume. Pausing stops new runs from starting; a run already in flight finishes. */
export async function setWorkerPaused(ctx: CompanyCtx, input: { workerId: string; paused: boolean; reason?: string }): Promise<Outcome<WorkerWrite>> {
  const snap = await loadSnapshot(ctx);
  const worker = snap.workers.find((w) => w.id === input.workerId);
  if (!worker) return fail(404, `no worker "${input.workerId}". GET /api/company lists the roster.`);
  if (isPaused(worker) === input.paused) return succeed({ worker: buildWorker(snap, worker), changed: false });
  const now = ctx.ports.now().toISOString();
  const next: Worker = { ...worker, paused: input.paused, ts: now };
  delete next.pausedAt;
  delete next.pauseReason;
  if (input.paused) {
    next.pausedAt = now;
    if (input.reason) next.pauseReason = input.reason;
  }
  await appendTeam(next, ctx.env);
  const verb = input.paused ? "paused" : "resumed";
  await recordActivity(ctx, { kind: `worker.${verb}`, actor: "owner", summary: `${verb} ${worker.id}${input.reason ? `: ${input.reason}` : ""}`, refs: { workerId: worker.id } });
  await announce(ctx, { workerId: worker.id });
  if (input.paused && abortWorker(ctx.home, worker.id)) await recordActivity(ctx, { kind: "run.finished", actor: "owner", summary: `aborted the in-flight run of ${worker.id}`, refs: { workerId: worker.id } });
  if (!input.paused) await drainWorker(ctx, worker.id);
  return succeed({ worker: await viewOf(ctx, worker.id), changed: true });
}
