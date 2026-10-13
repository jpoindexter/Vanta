import type { RouteCtx } from "./server-routes.js";
import type { ControlTable } from "./control-http.js";
import { profilesGet, profilesPost } from "./profiles-api.js";

const GET: ControlTable = { ...profilesGet };
const POST: ControlTable = { ...profilesPost };

/** Hermes-control routes (profiles, schedules, sessions, skills, projects). GET and POST only. */
export async function handleControlRoute(ctx: RouteCtx): Promise<boolean> {
  const table = ctx.req.method === "GET" ? GET : ctx.req.method === "POST" ? POST : undefined;
  const handler = table?.[ctx.pathname];
  if (!handler) return false;
  await handler({ req: ctx.req, res: ctx.res, state: ctx.state, pathname: ctx.pathname });
  return true;
}
