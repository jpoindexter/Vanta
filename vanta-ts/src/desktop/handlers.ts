import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createConversation, type StreamEvent } from "../agent.js";
import type { Conversation } from "../agent.js";
import { buildSummarizer, prepareRun, writeRunMemory } from "../session.js";
import type { RunSetup } from "../session.js";
import { listSessions, loadSession, newSessionId, saveSession } from "../sessions/store.js";
import { PROVIDER_CATALOG, providerById } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import { upsertEnvMigratingLegacy, envPath } from "../setup.js";
import { listRepoFiles } from "../term/at-context.js";
import { resolveEventFormatter } from "../term/event-format.js";
import { pushSseEvent, type SseClients } from "./session-state.js";
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
  _sseSessionId?: string;
  _sseClients?: SseClients;
};

export function eventLabel(event: StreamEvent): DesktopEvent | null {
  // Delegates to the shared StreamEventFormatter port (term/event-format) so the
  // label presentation lives in one swappable place, not inline per surface.
  return resolveEventFormatter().format(event);
}

export function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}));
    req.on("error", reject);
  });
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function attachConversation(state: DesktopState, setup: RunSetup, history?: Parameters<typeof createConversation>[2]): void {
  state.convo = createConversation(setup.systemPrompt, {
    provider: setup.provider, safety: setup.safety, registry: setup.registry, root: state.root,
    sessionId: state.sessionId,
    requestApproval: (action, reason, toolName) => requestWebApproval(state, action, reason, toolName),
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider),
    activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    onEvent: (event) => {
      const label = eventLabel(event);
      if (label) {
        state.currentEvents?.push(label);
        if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, label);
      }
    },
  }, history);
}

async function ensureDesktopConversation(state: DesktopState): Promise<Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState> {
  if (!state.setup) state.setup = await prepareRun(state.root, "desktop interface session");
  if (!state.sessionId) { state.sessionId = newSessionId(); state.sessionStarted = new Date().toISOString(); }
  if (!state.convo) attachConversation(state, state.setup);
  return state as Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState;
}

async function persistActiveSession(state: DesktopState): Promise<void> {
  if (!state.convo || !state.sessionId) return;
  await saveSession(state.sessionId, state.convo.messages, { started: state.sessionStarted });
}

export async function handleStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  const goals = await live.setup.safety.getGoals().catch(() => live.setup.goals);
  sendJson(res, 200, { kernel: "online", model: live.setup.provider.modelId(), provider: process.env.VANTA_PROVIDER ?? "openai", tools: live.setup.registry.list().length, sessionId: live.sessionId, goals: goals.filter((g) => g.status === "active") });
}

export async function handleSessions(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listSessions(process.env));
}

export async function handleNewSession(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup;
  state.sessionId = newSessionId();
  state.sessionStarted = new Date().toISOString();
  attachConversation(state, setup);
  sendJson(res, 200, { id: state.sessionId });
}

export async function handleOpenSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const session = id ? await loadSession(id, process.env) : null;
  if (!session) return sendJson(res, 404, { error: "session not found" });
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup; state.sessionId = session.id; state.sessionStarted = session.started;
  attachConversation(state, setup, { history: session.messages });
  sendJson(res, 200, { id: session.id, title: session.title, messages: session.messages.filter((m) => m.role !== "system") });
}

export async function handleTools(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  sendJson(res, 200, live.setup.registry.schemas().map((t) => ({ name: t.name, desc: t.description })));
}

export async function handleFiles(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const files = await listRepoFiles(state.root, 3);
  sendJson(res, 200, files.slice(0, 400));
}

export async function handleModels(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, PROVIDER_CATALOG.map((p) => ({ id: p.id, label: p.label, short: p.short, defaultModel: p.defaultModel, models: p.models, current: p.id === (process.env.VANTA_PROVIDER ?? "openai") })));
}

export async function handleSetModel(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { provider?: unknown; model?: unknown };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model : "";
  if (!provider || !model) return sendJson(res, 400, { error: "provider and model are required" });
  process.env.VANTA_PROVIDER = provider;
  process.env.VANTA_MODEL = model;
  try {
    const existing = existsSync(envPath(state.root)) ? await readFile(envPath(state.root), "utf8") : "";
    const entry = providerById(provider);
    await writeFile(envPath(state.root), upsertEnvMigratingLegacy(existing, { VANTA_PROVIDER: provider, VANTA_MODEL: model }), { mode: 0o600 });
    const next = resolveProvider(process.env);
    state.convo?.setProvider(next, buildSummarizer(next));
    sendJson(res, 200, { provider, model, label: entry?.label ?? provider });
  } catch (err: unknown) {
    sendJson(res, 400, { error: err instanceof Error ? err.message : String(err), provider, model });
  }
}

export async function handleApproval(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "GET") {
    const p = state.pendingApproval;
    return sendJson(res, 200, p ? approvalPayload(p) : null);
  }
  const body = await readJson(req) as { id?: unknown; approved?: unknown; decision?: unknown };
  const p = state.pendingApproval;
  if (!p || body.id !== p.id) return sendJson(res, 404, { error: "approval not found" });
  state.pendingApproval = undefined;
  await resolveApproval(p, approvalDecision(body.decision, body.approved));
  sendJson(res, 200, { ok: true });
}

export async function handleTerminal(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { command?: unknown };
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return sendJson(res, 400, { error: "command is required" });
  const live = await ensureDesktopConversation(state);
  const tool = live.setup.registry.get("shell_cmd");
  if (!tool) return sendJson(res, 200, { ok: false, output: "unknown tool: shell_cmd" });
  const verdict = await live.setup.safety.assess(`shell_cmd ${command}`);
  if (verdict.risk === "block") return sendJson(res, 200, { ok: false, output: `blocked: ${verdict.reason}` });
  if (verdict.risk === "ask") {
    const approved = await requestWebApproval(state, `shell_cmd ${command}`, verdict.reason, "shell_cmd");
    if (!approved) return sendJson(res, 200, { ok: false, output: `denied: ${verdict.reason}` });
  }
  const result = await tool.execute({ command }, { root: state.root, sessionId: state.sessionId, safety: live.setup.safety, requestApproval: (action: string, reason: string) => requestWebApproval(state, action, reason, "shell_cmd") });
  sendJson(res, 200, result);
}

export async function handleChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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
