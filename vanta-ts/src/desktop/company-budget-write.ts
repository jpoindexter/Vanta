import { getBudget, setBudgetLimit } from "../budget/store.js";
import type { Budget } from "../budget/types.js";
import { appendTeam } from "../team/store.js";
import type { z } from "zod";
import { recordActivity } from "./company-activity.js";
import { requireOwnerApproval } from "./company-approval.js";
import { limitView, scopeParts } from "./company-budgets.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { announce } from "./company-emit.js";
import type { BudgetLimitView } from "./company-finance-schemas.js";
import { withCompanyLock } from "./company-lock.js";
import { loadSnapshot } from "./company-snapshot.js";
import type { RaiseBudgetBody } from "./company-write-schemas.js";
import { drainWorker } from "./company-run-engine.js";

export type BudgetWrite = { budget: BudgetLimitView; changed: boolean; previousLimitUsd: number | null };

/**
 * Raise (or first set) a scope's limit. Never lowers: a request at or below the
 * current limit is a no-op. Raising authority needs a fresh owner approval. The
 * change is journaled in the company activity log with before and after values;
 * config-revisions.jsonl is not used because `config rollback` writes its
 * snapshots back into .env.
 */
async function applyRaise(ctx: CompanyCtx, body: z.infer<typeof RaiseBudgetBody>, before: Budget | null, workerId: string | undefined): Promise<BudgetLimitView> {
  const next = await setBudgetLimit(ctx.dataDir, { scope: body.scope, limitUsd: body.limitUsd, now: ctx.ports.now() });
  const worker = workerId ? (await loadSnapshot(ctx)).workers.find((w) => w.id === workerId) : undefined;
  if (worker) await appendTeam({ ...worker, budgetUsd: body.limitUsd, ts: ctx.ports.now().toISOString() }, ctx.env);
  await recordActivity(ctx, { kind: "budget.raised", actor: "owner", summary: `raised ${body.scope} from ${before?.limitUsd ?? "none"} to ${body.limitUsd} USD`, refs: { scope: body.scope } });
  if (worker) {
    await announce(ctx, { workerId: worker.id });
    await drainWorker(ctx, worker.id);
  }
  return limitView(next);
}

export async function raiseBudget(ctx: CompanyCtx, body: z.infer<typeof RaiseBudgetBody>): Promise<Outcome<BudgetWrite>> {
  const { kind, subject } = scopeParts(body.scope);
  const workerId = kind === "worker" ? (subject ?? undefined) : undefined;
  const [snap, before] = await withCompanyLock(ctx.home, async () => [await loadSnapshot(ctx), await getBudget(ctx.dataDir, body.scope)] as const);
  if (workerId && !snap.workers.some((w) => w.id === workerId)) return fail(404, `no worker "${workerId}" for scope ${body.scope}. GET /api/company lists the roster.`);
  if (before && before.limitUsd >= body.limitUsd) return succeed({ budget: limitView(before), changed: false, previousLimitUsd: before.limitUsd });
  const approval = await requireOwnerApproval(ctx, {
    tool: "company.budget",
    action: `Raise ${body.scope} budget to ${body.limitUsd} USD`,
    reason: before ? `From ${before.limitUsd} USD; ${before.spentUsd.toFixed(2)} USD spent so far.` : "No limit is set for this scope yet.",
  });
  if (!approval.ok) return approval;
  const budget = await withCompanyLock(ctx.home, () => applyRaise(ctx, body, before, workerId));
  return succeed({ budget, changed: true, previousLimitUsd: before?.limitUsd ?? null });
}
