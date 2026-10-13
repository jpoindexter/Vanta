import type http from "node:http";
import type { z } from "zod";
import { raiseBudget } from "./company-budget-write.js";
import { companyCtx, type CompanyCtx, type Outcome } from "./company-context.js";
import { parseBody, sendFailure } from "./company-http.js";
import { withCompanyLock } from "./company-lock.js";
import { approveProduct, reviseProduct } from "./company-products-write.js";
import { handleCompanyRead } from "./company-read-routes.js";
import { handleRuntimesRead } from "./company-runtime-routes.js";
import { runTick } from "./company-tick.js";
import { answerTicket, assignTicket, closeTicket, commentTicket, createTicketRoute } from "./company-tickets-write.js";
import { hireWorker, setWorkerPaused } from "./company-workers-write.js";
import {
  AnswerBody, ApproveBody, AssignBody, CloseBody, CommentBody, CreateTicketBody, HireBody,
  PauseBody, RaiseBudgetBody, ResumeBody, ReviseBody, TickBody,
} from "./company-write-schemas.js";
import { sendJson } from "./handler-http.js";
import type { DesktopState } from "./handler-state.js";

const PREFIX = "/api/company/";
/** Probes the installed CLIs (up to seconds), so it is served outside the company lock. */
const RUNTIMES_ROUTE = "/api/company/runtimes";
const GET_ROUTES = /^\/api\/(company|tickets|budgets|activity|okrs|work-products|heartbeats)(\/|$)/;

type Action = (ctx: CompanyCtx, req: http.IncomingMessage) => Promise<{ status: number; body: unknown }>;

/** Bind a Zod body schema to a handler; invalid bodies answer 400 naming the field. */
function action<S extends z.ZodTypeAny, T>(schema: S, run: (ctx: CompanyCtx, body: z.infer<S>) => Promise<Outcome<T>>, opts: { locks?: boolean } = {}): Action {
  return async (ctx, req) => {
    const body = await parseBody(req, schema);
    if (!body.ok) return { status: 400, body: { error: body.error } };
    const result = opts.locks === false ? await run(ctx, body.value) : await withCompanyLock(ctx.home, () => run(ctx, body.value));
    return result.ok ? { status: 200, body: result.value } : { status: result.status, body: { error: result.error } };
  };
}

const POST_ROUTES: Record<string, Action> = {
  "workers/hire": action(HireBody, hireWorker, { locks: false }),
  "workers/pause": action(PauseBody, (ctx, b) => setWorkerPaused(ctx, { workerId: b.workerId, paused: true, reason: b.reason })),
  "workers/resume": action(ResumeBody, (ctx, b) => setWorkerPaused(ctx, { workerId: b.workerId, paused: false })),
  "tickets/create": action(CreateTicketBody, createTicketRoute),
  "tickets/assign": action(AssignBody, assignTicket),
  "tickets/comment": action(CommentBody, commentTicket),
  "tickets/close": action(CloseBody, closeTicket),
  "tickets/answer": action(AnswerBody, answerTicket),
  "work-products/approve": action(ApproveBody, (ctx, b) => approveProduct(ctx, b.workProductId)),
  "work-products/revise": action(ReviseBody, reviseProduct),
  "budgets/raise": action(RaiseBudgetBody, raiseBudget, { locks: false }),
  "tick": action(TickBody, (ctx) => runTick(ctx)),
};

async function handleCompanyWrite(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
  const handler = POST_ROUTES[pathname.slice(PREFIX.length)];
  if (!handler) {
    sendFailure(res, 404, `unknown company route ${pathname}. Known: ${Object.keys(POST_ROUTES).map((r) => PREFIX + r).join(", ")}`);
    return true;
  }
  const reply = await handler(companyCtx(state), req);
  sendJson(res, reply.status, reply.body);
  return true;
}

/**
 * Entry point for the company API (DN-18). GET reads the real stores; POST
 * (under /api/company/) mutates them through the engine. Returns false for
 * paths it does not own. The boundary token and the GET/POST-only rule are
 * enforced before this runs (desktopBoundaryDecision).
 */
export async function handleCompanyRoute(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  if (!GET_ROUTES.test(pathname)) return false;
  if (req.method === "GET" && pathname === RUNTIMES_ROUTE) { await handleRuntimesRead(state, res); return true; }
  if (req.method === "GET") return withCompanyLock(companyCtx(state).home, () => handleCompanyRead(state, req, res));
  if (req.method === "POST" && pathname.startsWith(PREFIX)) return handleCompanyWrite(state, req, res, pathname);
  return false;
}
