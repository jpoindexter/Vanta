import { z } from "zod";
import { exportSession } from "../sessions/export.js";
import { forkSessionAt } from "../sessions/fork-at.js";
import { markAllSessionsRead, setSessionUnread } from "../sessions/read-state.js";
import { searchSessions } from "../sessions/search.js";
import { listAllSessions, loadSession } from "../sessions/store.js";
import { type ControlTable, errorText, parseBody, parseQuery, sendFail, sendOk } from "./control-http.js";
import { sendJson } from "./handler-http.js";

const SearchQuery = z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().min(1).max(100).default(20) });
const ExportQuery = z.object({ id: z.string().trim().min(1), format: z.enum(["markdown", "json"]).default("markdown") });
const ForkBody = z.object({ id: z.string().trim().min(1), count: z.number().int().min(0).optional() });
const UnreadBody = z.union([
  z.object({ id: z.string().trim().min(1), unread: z.boolean() }),
  z.object({ all: z.literal(true) }),
]);

const SEARCH_SESSION_WINDOW = 300;

const search: ControlTable[string] = async (ctx) => {
  const query = parseQuery(ctx, SearchQuery);
  if (!query) return;
  const env = ctx.state._env ?? process.env;
  const [matches, metas] = await Promise.all([
    searchSessions(query.q, env, { maxResults: query.limit, maxSessions: SEARCH_SESSION_WINDOW }),
    listAllSessions(env),
  ]);
  const byId = new Map(metas.map((meta) => [meta.id, meta]));
  const results = matches.map((match) => {
    const meta = byId.get(match.sessionId);
    return { sessionId: match.sessionId, title: meta?.title ?? "", started: meta?.started ?? "", updated: meta?.updated ?? "", role: match.role, snippet: match.snippet };
  });
  sendJson(ctx.res, 200, { results });
};

const unread: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, UnreadBody);
  if (!body) return;
  const env = ctx.state._env ?? process.env;
  if ("all" in body) return sendOk(ctx.res, { marked: await markAllSessionsRead(await listAllSessions(env), env) });
  if (!(await loadSession(body.id, env))) return sendFail(ctx.res, 404, "session not found");
  await setSessionUnread(body.id, body.unread, env);
  sendOk(ctx.res, { id: body.id, unread: body.unread });
};

const exportOne: ControlTable[string] = async (ctx) => {
  const query = parseQuery(ctx, ExportQuery);
  if (!query) return;
  const session = await loadSession(query.id, ctx.state._env ?? process.env);
  if (!session) return sendFail(ctx.res, 404, "session not found");
  const exported = exportSession(session, query.format);
  sendJson(ctx.res, 200, { id: session.id, title: session.title, format: query.format, ...exported });
};

const fork: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ForkBody);
  if (!body) return;
  try {
    const branch = await forkSessionAt(body.id, { count: body.count, env: ctx.state._env ?? process.env });
    if (!branch) return sendFail(ctx.res, 404, "session not found");
    sendOk(ctx.res, { id: branch.id, title: branch.title, parentId: body.id, messageCount: branch.messages.filter((m) => m.role !== "system").length });
  } catch (error) { sendFail(ctx.res, 500, `could not branch session: ${errorText(error)}`); }
};

export const sessionsControlGet: ControlTable = { "/api/sessions/search": search, "/api/sessions/export": exportOne };
export const sessionsControlPost: ControlTable = { "/api/sessions/unread": unread, "/api/sessions/fork": fork };
