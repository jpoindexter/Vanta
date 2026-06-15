import http from "node:http";
import { createConversation, type StreamEvent } from "../agent.js";
import { buildSummarizer, prepareRun, writeRunMemory } from "../session.js";
import { listSessions, loadSession, newSessionId, saveSession } from "../sessions/store.js";
import { PROVIDER_CATALOG, providerById } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import { upsertEnvMigratingLegacy, envPath } from "../setup.js";
import { listRepoFiles } from "../term/at-context.js";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";
import {
  getSession, attachSse, pushSseEvent, sessionIdFromRequest,
  type SessionMap, type SseClients,
} from "./session-state.js";
import { writeDesktopAsset } from "./assets.js";
import { approvalDecision, approvalPayload, requestWebApproval, resolveApproval, type PendingApproval } from "./approval.js";
export { approvalDecision, type PendingApproval } from "./approval.js";

export type DesktopEvent = { label: string; ok?: boolean };
export type DesktopState = {
  setup?: RunSetup;
  convo?: Conversation;
  root: string;
  sessionId?: string;
  sessionStarted?: string;
  currentEvents?: DesktopEvent[];
  pendingApproval?: PendingApproval;
  // DESKTOP-P1: injected by the router to push events over SSE.
  _sseSessionId?: string;
  _sseClients?: SseClients;
};

export function eventLabel(event: StreamEvent): DesktopEvent | null {
  if (event.type === "tool_start") return { label: `→ ${event.name}` };
  if (event.type === "tool_end") return { label: `${event.ok ? "✓" : "✗"} ${event.name}: ${event.output.slice(0, 90)}`, ok: event.ok };
  if (event.type === "note") return { label: `note: ${event.text.slice(0, 100)}` };
  return null;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function attachConversation(state: DesktopState, setup: RunSetup, history?: Parameters<typeof createConversation>[2]): void {
  state.convo = createConversation(setup.systemPrompt, {
    provider: setup.provider,
    safety: setup.safety,
    registry: setup.registry,
    root: state.root,
    requestApproval: (action, reason, toolName) => requestWebApproval(state, action, reason, toolName),
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider),
    activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    onEvent: (event) => {
      const label = eventLabel(event);
      if (label) {
        state.currentEvents?.push(label);
        // DESKTOP-P1: push to live SSE subscribers.
        if (state._sseClients && state._sseSessionId) {
          pushSseEvent(state._sseClients, state._sseSessionId, label);
        }
      }
    },
  }, history);
}

async function ensureDesktopConversation(state: DesktopState): Promise<Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState> {
  if (!state.setup) state.setup = await prepareRun(state.root, "desktop interface session");
  if (!state.sessionId) {
    state.sessionId = newSessionId();
    state.sessionStarted = new Date().toISOString();
  }
  if (!state.convo) attachConversation(state, state.setup);
  return state as Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState;
}

async function persistActiveSession(state: DesktopState): Promise<void> {
  if (!state.convo || !state.sessionId) return;
  await saveSession(state.sessionId, state.convo.messages, {
    started: state.sessionStarted,
  });
}

async function handleStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  const goals = await live.setup.safety.getGoals().catch(() => live.setup.goals);
  sendJson(res, 200, {
    kernel: "online",
    model: live.setup.provider.modelId(),
    provider: process.env.VANTA_PROVIDER ?? "openai",
    tools: live.setup.registry.list().length,
    sessionId: live.sessionId,
    goals: goals.filter((g) => g.status === "active"),
  });
}

async function handleSessions(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listSessions(process.env));
}

async function handleNewSession(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup;
  state.sessionId = newSessionId();
  state.sessionStarted = new Date().toISOString();
  attachConversation(state, setup);
  sendJson(res, 200, { id: state.sessionId });
}

async function handleOpenSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const session = id ? await loadSession(id, process.env) : null;
  if (!session) return sendJson(res, 404, { error: "session not found" });
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup;
  state.sessionId = session.id;
  state.sessionStarted = session.started;
  attachConversation(state, setup, { history: session.messages });
  sendJson(res, 200, { id: session.id, title: session.title, messages: session.messages.filter((m) => m.role !== "system") });
}

async function handleTools(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  sendJson(res, 200, live.setup.registry.schemas().map((t) => ({ name: t.name, desc: t.description })));
}

async function handleFiles(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const files = await listRepoFiles(state.root, 3);
  sendJson(res, 200, files.slice(0, 400));
}

async function handleModels(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    label: p.label,
    short: p.short,
    defaultModel: p.defaultModel,
    models: p.models,
    current: p.id === (process.env.VANTA_PROVIDER ?? "openai"),
  })));
}

async function handleSetModel(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { provider?: unknown; model?: unknown };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model : "";
  if (!provider || !model) return sendJson(res, 400, { error: "provider and model are required" });
  process.env.VANTA_PROVIDER = provider;
  process.env.VANTA_MODEL = model;
  try {
    const existing = existsSync(envPath(state.root)) ? await readFile(envPath(state.root), "utf8") : "";
    // DESKTOP-P5: use upsertEnvMigratingLegacy so stale ARGO_* twins are removed.
    const entry = providerById(provider);
    const updates: Record<string, string> = { VANTA_PROVIDER: provider, VANTA_MODEL: model };
    await writeFile(envPath(state.root), upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
    const next = resolveProvider(process.env);
    state.convo?.setProvider(next, buildSummarizer(next));
    sendJson(res, 200, { provider, model, label: entry?.label ?? provider });
  } catch (err: unknown) {
    // DESKTOP-P5: unavailable provider shown as error (not crash).
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err), provider, model });
  }
}

async function handleApproval(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "GET") {
    const p = state.pendingApproval;
    return sendJson(res, 200, p ? approvalPayload(p) : null);
  }
  const body = await readJson(req) as { id?: unknown; approved?: unknown; decision?: unknown };
  const p = state.pendingApproval;
  if (!p || body.id !== p.id) return sendJson(res, 404, { error: "approval not found" });
  state.pendingApproval = undefined;
  const decision = approvalDecision(body.decision, body.approved);
  await resolveApproval(p, decision);
  sendJson(res, 200, { ok: true });
}

async function runDirectTool(state: DesktopState, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output: string }> {
  const live = await ensureDesktopConversation(state);
  const tool = live.setup.registry.get(name);
  if (!tool) return { ok: false, output: `unknown tool: ${name}` };
  const action = tool.describeForSafety ? tool.describeForSafety(args) : `${name} ${JSON.stringify(args)}`;
  const verdict = await live.setup.safety.assess(action);
  if (verdict.risk === "block") return { ok: false, output: `blocked: ${verdict.reason}` };
  if (verdict.risk === "ask") {
    const approved = await requestWebApproval(state, action, verdict.reason, name);
    if (!approved) return { ok: false, output: `denied: ${verdict.reason}` };
  }
  return tool.execute(args, { root: state.root, safety: live.setup.safety, requestApproval: (action: string, reason: string) => requestWebApproval(state, action, reason, name) });
}

async function handleTerminal(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { command?: unknown };
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return sendJson(res, 400, { error: "command is required" });
  const result = await runDirectTool(state, "shell_cmd", { command });
  sendJson(res, 200, result);
}

async function handleChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return sendJson(res, 400, { error: "message is required" });
  const live = await ensureDesktopConversation(state);
  const events: DesktopEvent[] = [];
  state.currentEvents = events;
  try {
    const outcome = await live.convo.send(message, undefined, undefined);
    await writeRunMemory({ provider: live.setup.provider, goals: live.setup.goals, instruction: message, finalText: outcome.finalText });
    await persistActiveSession(state);
    events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done" });
    sendJson(res, 200, { finalText: outcome.finalText, events, usage: outcome.usage, sessionId: state.sessionId });
  } finally {
    state.currentEvents = undefined;
  }
}

type RouteCtx = { req: http.IncomingMessage; res: http.ServerResponse; state: DesktopState; sid: string; sseClients: SseClients; pathname: string };

/** Dispatch GET routes. Returns true when handled. */
async function routeGet(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (await writeDesktopAsset(state.root, p, res)) return true;
  // DESKTOP-P1: SSE event stream — live tool/text events during a run.
  if (p === "/api/events") { attachSse(sseClients, sid, res); return true; }
  if (p === "/api/status") { await handleStatus(state, res); return true; }
  if (p === "/api/sessions") { await handleSessions(res); return true; }
  if (p === "/api/tools") { await handleTools(state, res); return true; }
  if (p === "/api/files") { await handleFiles(state, res); return true; }
  if (p === "/api/models") { await handleModels(res); return true; }
  if (p === "/api/approval") { await handleApproval(state, req, res); return true; }
  return false;
}

/** Dispatch POST routes. Returns true when handled. */
async function routePost(ctx: RouteCtx): Promise<boolean> {
  const { req, res, state, sid, sseClients, pathname: p } = ctx;
  if (p === "/api/sessions/new") { await handleNewSession(state, res); return true; }
  if (p === "/api/sessions/open") { await handleOpenSession(state, req, res); return true; }
  if (p === "/api/model") { await handleSetModel(state, req, res); return true; }
  if (p === "/api/approval") { await handleApproval(state, req, res); return true; }
  if (p === "/api/terminal") { await handleTerminal(state, req, res); return true; }
  if (p === "/api/chat") {
    // Wire SSE push into the conversation events for DESKTOP-P1.
    state._sseSessionId = sid; state._sseClients = sseClients;
    await handleChat(state, req, res); return true;
  }
  return false;
}

type ServerOpts = { sessions: SessionMap; sseClients: SseClients; repoRoot: string };

async function routeRequest(req: http.IncomingMessage, res: http.ServerResponse, opts: ServerOpts): Promise<void> {
  const { sessions, sseClients, repoRoot } = opts;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const sid = sessionIdFromRequest(req);
  const state = getSession(sessions, sid, repoRoot);
  const ctx: RouteCtx = { req, res, state, sid, sseClients, pathname: url.pathname };
  const handled = req.method === "GET" ? await routeGet(ctx) : req.method === "POST" ? await routePost(ctx) : false;
  if (!handled) sendJson(res, 404, { error: "not found" });
}

export function createDesktopServer(repoRoot: string): http.Server {
  const sessions: SessionMap = new Map(); // DESKTOP-P2: per-session state map
  const sseClients: SseClients = new Map(); // DESKTOP-P1: SSE clients per session
  const opts: ServerOpts = { sessions, sseClients, repoRoot };
  return http.createServer((req, res) => {
    void routeRequest(req, res, opts)
      .catch((err: unknown) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });
}

export async function serveDesktop(repoRoot: string, port = 7790): Promise<void> {
  const server = createDesktopServer(repoRoot);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`vanta desktop — http://127.0.0.1:${port}`);
}
