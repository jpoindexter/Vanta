import http from "node:http";
import { createConversation, type StreamEvent } from "../agent.js";
import { buildSummarizer, prepareRun, writeRunMemory } from "../session.js";
import { desktopHtml } from "./page.js";
import { listSessions, loadSession, newSessionId, saveSession } from "../sessions/store.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import { upsertEnv, envPath } from "../setup.js";
import { listRepoFiles } from "../tui/at-context.js";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Conversation } from "../agent.js";
import type { RunSetup } from "../session.js";

export type DesktopEvent = { label: string; ok?: boolean };
export type PendingApproval = {
  id: string;
  action: string;
  reason: string;
  toolName?: string;
  resolve: (approved: boolean) => void;
};
export type DesktopState = {
  setup?: RunSetup;
  convo?: Conversation;
  root: string;
  sessionId?: string;
  sessionStarted?: string;
  currentEvents?: DesktopEvent[];
  pendingApproval?: PendingApproval;
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

async function requestWebApproval(state: DesktopState, action: string, reason: string, toolName?: string): Promise<boolean> {
  if (state.pendingApproval) return false;
  return new Promise<boolean>((resolve) => {
    state.pendingApproval = { id: `${Date.now()}`, action, reason, toolName, resolve };
  });
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
      if (label) state.currentEvents?.push(label);
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
    await writeFile(envPath(state.root), upsertEnv(existing, { VANTA_PROVIDER: provider, VANTA_MODEL: model }), { mode: 0o600 });
    const next = resolveProvider(process.env);
    state.convo?.setProvider(next, buildSummarizer(next));
    sendJson(res, 200, { provider, model });
  } catch (err: unknown) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleApproval(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "GET") {
    const p = state.pendingApproval;
    return sendJson(res, 200, p ? { id: p.id, action: p.action, reason: p.reason, toolName: p.toolName } : null);
  }
  const body = await readJson(req) as { id?: unknown; approved?: unknown };
  const p = state.pendingApproval;
  if (!p || body.id !== p.id) return sendJson(res, 404, { error: "approval not found" });
  state.pendingApproval = undefined;
  p.resolve(Boolean(body.approved));
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
    await writeRunMemory(live.setup.provider, live.setup.goals, message, outcome.finalText);
    await persistActiveSession(state);
    events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done" });
    sendJson(res, 200, { finalText: outcome.finalText, events, usage: outcome.usage, sessionId: state.sessionId });
  } finally {
    state.currentEvents = undefined;
  }
}

export function createDesktopServer(repoRoot: string): http.Server {
  const state: DesktopState = { root: repoRoot };
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(desktopHtml());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/status") return handleStatus(state, res);
      if (req.method === "GET" && url.pathname === "/api/sessions") return handleSessions(res);
      if (req.method === "POST" && url.pathname === "/api/sessions/new") return handleNewSession(state, res);
      if (req.method === "POST" && url.pathname === "/api/sessions/open") return handleOpenSession(state, req, res);
      if (req.method === "GET" && url.pathname === "/api/tools") return handleTools(state, res);
      if (req.method === "GET" && url.pathname === "/api/files") return handleFiles(state, res);
      if (req.method === "GET" && url.pathname === "/api/models") return handleModels(res);
      if (req.method === "POST" && url.pathname === "/api/model") return handleSetModel(state, req, res);
      if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/approval") return handleApproval(state, req, res);
      if (req.method === "POST" && url.pathname === "/api/terminal") return handleTerminal(state, req, res);
      if (req.method === "POST" && url.pathname === "/api/chat") return handleChat(state, req, res);
      sendJson(res, 404, { error: "not found" });
    })().catch((err: unknown) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
  });
}

export async function serveDesktop(repoRoot: string, port = 7790): Promise<void> {
  const server = createDesktopServer(repoRoot);
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`vanta desktop — http://127.0.0.1:${port}`);
}
