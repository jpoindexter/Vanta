import type http from "node:http";
import { z } from "zod";
import { pendingProposals, readProposals } from "../cofounder/self-org.js";
import { listPendingArtifacts } from "../cofounder/outcome-approval.js";
import { reviewQueue } from "../team/review-stage.js";
import { buildBudgets } from "./company-budgets.js";
import {
  ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT, decodeCursor, pageActivity,
  readCompanyActivity, readKernelActivity,
} from "./company-activity.js";
import { companyCtx, type CompanyCtx } from "./company-context.js";
import { BudgetsResponseSchema, HeartbeatsResponseSchema, OkrsResponseSchema } from "./company-finance-schemas.js";
import { buildHeartbeats } from "./company-heartbeats.js";
import { parseQuery, sendFailure, sendValidated } from "./company-http.js";
import { buildOkrs } from "./company-okrs.js";
import { productViews } from "./company-products.js";
import { buildOrgChart, buildWorkers } from "./company-roster.js";
import {
  ActivityResponseSchema, CompanyResponseSchema, TICKET_VIEW_STATUSES, TicketDetailSchema,
  TicketsResponseSchema, WorkProductsResponseSchema, type CompanyResponse,
} from "./company-schemas.js";
import { loadSnapshot, type CompanySnapshot } from "./company-snapshot.js";
import { buildDetail, buildSummaries } from "./company-tickets.js";
import type { DesktopState } from "./handler-state.js";

// GET surface of the company API. Every handler reads the real stores through
// the engine's tolerant readers, so an absent store is an empty payload, never a 500.

const TICKETS_DEFAULT_LIMIT = 200;
const TICKETS_MAX_LIMIT = 500;

const TicketsQuery = z.object({
  worker: z.string().min(1).optional(),
  status: z.enum(TICKET_VIEW_STATUSES).optional(),
  project: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(TICKETS_MAX_LIMIT).default(TICKETS_DEFAULT_LIMIT),
});

const ActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(ACTIVITY_MAX_LIMIT).default(ACTIVITY_DEFAULT_LIMIT),
  cursor: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  worker: z.string().min(1).optional(),
  ticket: z.string().min(1).optional(),
  source: z.enum(["company", "kernel", "all"]).default("company"),
});

const ProductsQuery = z.object({
  ticket: z.string().min(1).optional(),
  worker: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  approval: z.enum(["approved", "pending"]).optional(),
  kind: z.string().min(1).optional(),
});

async function companyPayload(ctx: CompanyCtx, snap: CompanySnapshot): Promise<CompanyResponse> {
  const workers = buildWorkers(snap);
  const proposals = await readProposals(ctx.env);
  const open = buildSummaries(snap).filter((t) => t.status !== "done" && t.status !== "closed");
  const owedReviews = snap.tasks.flatMap((t) => reviewQueue([t], "owner"));
  return {
    generatedAt: snap.now.toISOString(),
    workers,
    orgChart: buildOrgChart(snap.workers),
    departments: snap.departments.map((d) => ({ id: d.id, name: d.name, workerIds: d.workerIds, budgetScope: d.budgetScope, goalIds: d.goalIds })),
    totals: {
      workers: workers.length,
      working: workers.filter((w) => w.status === "working").length,
      waiting: workers.filter((w) => w.status === "waiting").length,
      failed: workers.filter((w) => w.status === "failed").length,
      paused: workers.filter((w) => w.paused).length,
      openTickets: open.length,
      costUsd: workers.reduce((sum, w) => sum + w.costUsd, 0),
    },
    pending: { workProducts: listPendingArtifacts(snap.products).length, proposals: pendingProposals(proposals).length, reviews: owedReviews.length },
  };
}

async function tickets(ctx: CompanyCtx, url: URL, res: http.ServerResponse): Promise<void> {
  const query = parseQuery(url, TicketsQuery);
  if (!query.ok) return sendFailure(res, 400, query.error);
  const { worker, status, project, limit } = query.value;
  const all = buildSummaries(await loadSnapshot(ctx))
    .filter((t) => (!worker || t.workerId === worker) && (!status || t.status === status) && (!project || t.projectId === project));
  sendValidated(res, TicketsResponseSchema, {
    tickets: all.slice(0, limit),
    total: all.length,
    filters: { worker: worker ?? null, status: status ?? null, project: project ?? null },
  });
}

function decodeId(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

async function ticketDetail(ctx: CompanyCtx, rawId: string, res: http.ServerResponse): Promise<void> {
  const id = decodeId(rawId);
  if (!id) return sendFailure(res, 400, "ticket id is not valid percent-encoding");
  const detail = buildDetail(await loadSnapshot(ctx), id, await ctx.ports.readGoals(ctx.state).catch(() => []));
  if (!detail) return sendFailure(res, 404, `no ticket "${id}". List tickets with GET /api/tickets.`);
  sendValidated(res, TicketDetailSchema, detail);
}

async function activity(ctx: CompanyCtx, url: URL, res: http.ServerResponse): Promise<void> {
  const parsed = parseQuery(url, ActivityQuerySchema);
  if (!parsed.ok) return sendFailure(res, 400, parsed.error);
  const { source, cursor: rawCursor, ...query } = parsed.value;
  const cursor = rawCursor ? decodeCursor(rawCursor) : undefined;
  if (rawCursor && !cursor) return sendFailure(res, 400, "cursor: not a cursor from this API. Use the nextCursor value from the previous page.");
  const [own, kernel] = await Promise.all([
    source === "kernel" ? [] : readCompanyActivity(ctx.home),
    source === "company" ? [] : readKernelActivity(ctx.dataDir),
  ]);
  sendValidated(res, ActivityResponseSchema, pageActivity([...own, ...kernel], query, cursor ?? undefined));
}

async function workProducts(ctx: CompanyCtx, url: URL, res: http.ServerResponse): Promise<void> {
  const parsed = parseQuery(url, ProductsQuery);
  if (!parsed.ok) return sendFailure(res, 400, parsed.error);
  const q = parsed.value;
  const snap = await loadSnapshot(ctx);
  const matching = snap.products.filter((p) =>
    (!q.ticket || p.sourceTaskId === q.ticket) && (!q.worker || p.producedBy === q.worker) && (!q.department || p.departmentId === q.department)
    && (!q.kind || p.kind === q.kind) && (!q.approval || p.approved === (q.approval === "approved")));
  sendValidated(res, WorkProductsResponseSchema, { workProducts: productViews(matching, snap.revisions), pending: listPendingArtifacts(snap.products).length });
}

/** Route one GET. Returns false when the path is not a company route. */
export async function handleCompanyRead(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const ctx = companyCtx(state);
  if (path === "/api/company") sendValidated(res, CompanyResponseSchema, await companyPayload(ctx, await loadSnapshot(ctx)));
  else if (path === "/api/tickets") await tickets(ctx, url, res);
  else if (path.startsWith("/api/tickets/")) await ticketDetail(ctx, path.slice("/api/tickets/".length), res);
  else if (path === "/api/budgets") sendValidated(res, BudgetsResponseSchema, await buildBudgets(ctx, await loadSnapshot(ctx)));
  else if (path === "/api/activity") await activity(ctx, url, res);
  else if (path === "/api/okrs") sendValidated(res, OkrsResponseSchema, await buildOkrs(ctx));
  else if (path === "/api/work-products") await workProducts(ctx, url, res);
  else if (path === "/api/heartbeats") sendValidated(res, HeartbeatsResponseSchema, await buildHeartbeats(ctx, await loadSnapshot(ctx)));
  else return false;
  return true;
}
