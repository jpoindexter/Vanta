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
import type { LLMProvider } from "../providers/interface.js";
import { loadUserProviders } from "../providers/user-providers.js";
import { providerOverrideEnv } from "../providers/override-env.js";
import { upsertEnvMigratingLegacy, envPath } from "../setup.js";
import { listRepoFiles } from "../term/at-context.js";
import { resolveEventFormatter } from "../term/event-format.js";
import { pushSseEvent, type SseClients } from "./session-state.js";
import { approvalDecision, approvalPayload, requestWebApproval, resolveApproval, type PendingApproval } from "./approval.js";
import { readCanvasArtifact } from "../canvas/artifact.js";
export { approvalDecision, type PendingApproval } from "./approval.js";

export type DesktopEvent = { label: string; ok?: boolean; delta?: string };
export type DesktopState = {
  setup?: RunSetup;
  _setupPromise?: Promise<RunSetup>;
  _setupError?: { message: string; at: number };
  _chatActive?: boolean;
  _streamTextDeltas?: boolean;
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
    onTextDelta: (delta) => {
      if (state._streamTextDeltas && state._sseClients && state._sseSessionId) {
        pushSseEvent(state._sseClients, state._sseSessionId, { label: "", delta });
      }
    },
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
  if (!state.setup) {
    if (state._setupError && Date.now() - state._setupError.at < 30_000) throw new Error(state._setupError.message);
    state._setupPromise ??= prepareRun(state.root, "desktop interface session");
    try { state.setup = await state._setupPromise; state._setupError = undefined; }
    catch (error) { state._setupError = { message: (error as Error).message, at: Date.now() }; throw error; }
    finally { state._setupPromise = undefined; }
  }
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

export async function handleCanvas(state: DesktopState, res: http.ServerResponse): Promise<void> {
  try {
    sendJson(res, 200, await readCanvasArtifact(state.root));
  } catch (error) {
    sendJson(res, 422, { error: `invalid canvas artifact: ${(error as Error).message.split("\n")[0]}` });
  }
}

export type DesktopProviderOption = { id: string; label: string; short: string; defaultModel: string; models: string[]; current: boolean };

export function desktopProviderOptions(env: NodeJS.ProcessEnv): DesktopProviderOption[] {
  const current = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const options = new Map<string, DesktopProviderOption>();
  for (const provider of PROVIDER_CATALOG) {
    options.set(provider.id, {
      id: provider.id,
      label: provider.label,
      short: provider.short,
      defaultModel: provider.defaultModel,
      models: provider.models,
      current: provider.id === current,
    });
  }
  for (const [id, provider] of Object.entries(loadUserProviders(env))) {
    options.set(id, {
      id,
      label: id,
      short: "User-declared OpenAI-compatible provider",
      defaultModel: provider.model ?? "",
      models: provider.model ? [provider.model] : [],
      current: id === current,
    });
  }
  return [...options.values()];
}

export function resolveDesktopProviderSelection(env: NodeJS.ProcessEnv, provider: string, model?: string): {
  provider: string;
  model: string;
  env: NodeJS.ProcessEnv;
  resolved: LLMProvider;
} {
  const id = provider.trim().toLowerCase();
  if (!id) throw new Error("provider is required");
  const selectedEnv = providerOverrideEnv(env, id, model?.trim() || undefined);
  const resolved = resolveProvider(selectedEnv);
  return { provider: id, model: resolved.modelId(), env: selectedEnv, resolved };
}

export async function handleModels(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, desktopProviderOptions(process.env));
}

export async function handleSetModel(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { provider?: unknown; model?: unknown };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!provider) return sendJson(res, 400, { error: "provider is required" });
  try {
    const selection = resolveDesktopProviderSelection(process.env, provider, model || undefined);
    const existing = existsSync(envPath(state.root)) ? await readFile(envPath(state.root), "utf8") : "";
    await writeFile(envPath(state.root), upsertEnvMigratingLegacy(existing, { VANTA_PROVIDER: selection.provider, VANTA_MODEL: selection.model }), { mode: 0o600 });
    process.env.VANTA_PROVIDER = selection.provider;
    process.env.VANTA_MODEL = selection.model;
    state.setup && (state.setup.provider = selection.resolved);
    state.convo?.setProvider(selection.resolved, buildSummarizer(selection.resolved));
    const entry = providerById(selection.provider);
    sendJson(res, 200, { provider: selection.provider, model: selection.model, label: entry?.label ?? selection.provider });
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
  if (state._chatActive) return sendJson(res, 409, { error: "a turn is already running" });
  const body = await readJson(req) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return sendJson(res, 400, { error: "message is required" });
  state._chatActive = true;
  const events: DesktopEvent[] = [];
  state.currentEvents = events;
  try {
    const live = await ensureDesktopConversation(state);
    const outcome = await live.convo.send(message, undefined, undefined);
    await writeRunMemory({ provider: live.setup.provider, goals: live.setup.goals, instruction: message, finalText: outcome.finalText });
    await persistActiveSession(state);
    events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done" });
    sendJson(res, 200, { finalText: outcome.finalText, events, usage: outcome.usage, sessionId: state.sessionId });
  } finally {
    state.currentEvents = undefined;
    state._chatActive = false;
  }
}
