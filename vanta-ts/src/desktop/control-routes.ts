import type { RouteCtx } from "./server-routes.js";
import type { ControlHandler, ControlPattern, ControlTable } from "./control-http.js";
import { profilesGet, profilesPost } from "./profiles-api.js";
import { scheduleBlueprintsGet, scheduleBlueprintsPost } from "./schedule-blueprints-api.js";
import { scheduleControlPost } from "./schedule-control-api.js";
import { scheduleRunsGetPatterns, scheduleTriggerPost } from "./schedule-trigger.js";

const GET: ControlTable = { ...profilesGet, ...scheduleBlueprintsGet };
const POST: ControlTable = { ...profilesPost, ...scheduleControlPost, ...scheduleTriggerPost, ...scheduleBlueprintsPost };
const GET_PATTERNS: ControlPattern[] = [...scheduleRunsGetPatterns];
const POST_PATTERNS: ControlPattern[] = [];

function decode(value: string | undefined): string {
  try { return decodeURIComponent(value ?? ""); } catch { return value ?? ""; }
}

function resolve(method: string | undefined, pathname: string): { handler: ControlHandler; params: string[] } | undefined {
  const isGet = method === "GET";
  if (!isGet && method !== "POST") return undefined;
  const exact = (isGet ? GET : POST)[pathname];
  if (exact) return { handler: exact, params: [] };
  for (const [pattern, handler] of isGet ? GET_PATTERNS : POST_PATTERNS) {
    const match = pattern.exec(pathname);
    if (match) return { handler, params: match.slice(1).map(decode) };
  }
  return undefined;
}

/** Hermes-control routes (profiles, schedules, sessions, skills, projects). GET and POST only. */
export async function handleControlRoute(ctx: RouteCtx): Promise<boolean> {
  const found = resolve(ctx.req.method, ctx.pathname);
  if (!found) return false;
  await found.handler({ req: ctx.req, res: ctx.res, state: ctx.state, pathname: ctx.pathname, params: found.params });
  return true;
}
