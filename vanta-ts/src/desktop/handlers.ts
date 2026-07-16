import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createConversation, type StreamEvent } from "../agent.js";
import type { Conversation } from "../agent.js";
import type { DesktopRunFailureKind, DesktopRunReceipt } from "../types.js";
import { buildSummarizer, prepareRun, writeRunMemory } from "../session.js";
import type { RunSetup } from "../session.js";
import { deleteSession, listAllSessions, loadSession, newSessionId, renameSession, saveSession, setSessionArchived, checkpointSessionMessages } from "../sessions/store.js";
import { PROVIDER_CATALOG, providerById, type ProviderEntry } from "../providers/catalog.js";
import { diskCacheDeps, mergeProviderCatalog, resolveCatalog } from "../providers/catalog-manifest.js";
import { resolveVantaHome } from "../store/home.js";
import { providerModelDiscoveryTarget, resolveProvider } from "../providers/index.js";
import { discoverProviderModels, type ModelDiscoveryResult } from "../providers/model-discovery.js";
import type { LLMProvider } from "../providers/interface.js";
import { loadUserProviders } from "../providers/user-providers.js";
import { providerOverrideEnv } from "../providers/override-env.js";
import { upsertEnvMigratingLegacy, envPath } from "../setup.js";
import { providerIdFor, resolveSessionModel } from "../sessions/model-scope.js";
import { listRepoFiles } from "../term/at-context.js";
import { resolveEventFormatter } from "../term/event-format.js";
import { pushSseEvent, type SseClients } from "./session-state.js";
import { approvalDecision, approvalPayload, requestWebApproval, resolveApproval, type PendingApproval } from "./approval.js";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { desktopArtifacts, desktopCapabilities, desktopMessagingPlatforms, saveDesktopMessagingPlatform } from "./operator-data.js";
import { loadDesktopAccessMode, permissionModeForAccess, saveDesktopAccessMode, type DesktopAccessMode } from "./access-mode.js";
export { approvalDecision, type PendingApproval } from "./approval.js";

export type DesktopEvent = { label: string; ok?: boolean; delta?: string };
export type DesktopState = {
  setup?: RunSetup;
  _setupPromise?: Promise<RunSetup>;
  _setupError?: { message: string; at: number };
  _chatActive?: boolean;
  _chatAbort?: AbortController;
  _chatDeltas?: string[];
  _queuedMessage?: string;
  _streamTextDeltas?: boolean;
  convo?: Conversation;
  root: string;
  sessionId?: string;
  sessionStarted?: string;
  providerId?: string;
  modelId?: string;
  currentEvents?: DesktopEvent[];
  pendingApproval?: PendingApproval;
  accessMode?: DesktopAccessMode;
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
    usageAgent: "desktop",
    requestApproval: (action, reason, toolName, detail) => requestWebApproval(state, action, reason, toolName, detail),
    permissionMode: () => permissionModeForAccess(state.accessMode ?? "approve"),
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    summarize: buildSummarizer(setup.provider),
    activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    onTextDelta: (delta) => {
      state._chatDeltas?.push(delta);
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
  state.accessMode ??= await loadDesktopAccessMode(state.root);
  if (!state.setup) {
    if (state._setupError && Date.now() - state._setupError.at < 30_000) throw new Error(state._setupError.message);
    state._setupPromise ??= prepareRun(state.root, "desktop interface session");
    try { state.setup = await state._setupPromise; state._setupError = undefined; }
    catch (error) { state._setupError = { message: (error as Error).message, at: Date.now() }; throw error; }
    finally { state._setupPromise = undefined; }
  }
  if (!state.sessionId) { state.sessionId = newSessionId(); state.sessionStarted = new Date().toISOString(); }
  state.providerId ??= providerIdFor(state.setup.provider, process.env);
  state.modelId ??= state.setup.provider.modelId();
  if (!state.convo) attachConversation(state, state.setup);
  return state as Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState;
}

async function persistActiveSession(state: DesktopState): Promise<void> {
  if (!state.convo || !state.sessionId) return;
  await saveSession(state.sessionId, state.convo.messages, { started: state.sessionStarted, providerId: state.providerId, modelId: state.modelId });
}

export async function handleStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  const goals = await live.setup.safety.getGoals().catch(() => live.setup.goals);
  sendJson(res, 200, { kernel: "online", model: live.setup.provider.modelId(), provider: live.providerId ?? process.env.VANTA_PROVIDER ?? "openai", tools: live.setup.registry.list().length, sessionId: live.sessionId, root: state.root, goals: goals.filter((g) => g.status === "active"), accessMode: live.accessMode, accessScope: "project" });
}

export async function handleAccessMode(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  if (req.method === "GET") return sendJson(res, 200, { mode: live.accessMode, scope: "project" });
  const body = await readJson(req) as { mode?: unknown };
  if (body.mode !== "ask" && body.mode !== "approve" && body.mode !== "full") {
    return sendJson(res, 400, { error: "mode must be ask, approve, or full" });
  }
  await saveDesktopAccessMode(state.root, body.mode);
  state.accessMode = body.mode;
  const label = body.mode === "ask" ? "Ask for approval" : body.mode === "approve" ? "Approve for me" : "Full access";
  const event = { label: `Access mode changed to ${label} for this project.`, ok: true };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  await live.setup.safety.logEvent(JSON.stringify({ kind: "desktop_access_mode", mode: body.mode, scope: "project" })).catch(() => {});
  sendJson(res, 200, { mode: body.mode, scope: "project" });
}

export async function handleSessions(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listAllSessions(process.env));
}

export async function handleNewSession(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  state.setup = setup;
  state.sessionId = newSessionId();
  state.sessionStarted = new Date().toISOString();
  state.providerId = providerIdFor(setup.provider, process.env);
  state.modelId = setup.provider.modelId();
  attachConversation(state, setup);
  sendJson(res, 200, { id: state.sessionId });
}

export async function handleOpenSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  const session = id ? await loadSession(id, process.env) : null;
  if (!session) return sendJson(res, 404, { error: "session not found" });
  const setup = state.setup ?? await prepareRun(state.root, "desktop interface session");
  const sessionProvider = resolveSessionModel(session, process.env);
  if (sessionProvider) setup.provider = sessionProvider;
  state.setup = setup; state.sessionId = session.id; state.sessionStarted = session.started;
  state.providerId = session.providerId ?? providerIdFor(setup.provider, process.env);
  state.modelId = session.modelId ?? setup.provider.modelId();
  attachConversation(state, setup, { history: session.messages });
  sendJson(res, 200, { id: session.id, title: session.title, messages: session.messages.filter((m) => m.role !== "system") });
}

function sessionIdFromBody(body: { id?: unknown }): string {
  return typeof body.id === "string" ? body.id.trim() : "";
}

export async function handleRenameSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; title?: unknown };
  const id = sessionIdFromBody(body);
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (!title) return sendJson(res, 400, { error: "session title is required" });
  if (title.length > 120) return sendJson(res, 400, { error: "session title must be 120 characters or fewer" });
  const session = await renameSession(id, title, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  sendJson(res, 200, { id: session.id, title: session.title });
}

export async function handleArchiveSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; archived?: unknown };
  const id = sessionIdFromBody(body);
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (body.archived !== undefined && typeof body.archived !== "boolean") return sendJson(res, 400, { error: "archived must be boolean" });
  const session = await setSessionArchived(id, body.archived ?? true, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  sendJson(res, 200, { id: session.id, archived: Boolean(session.archived) });
}

export async function handleDeleteSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown };
  const id = sessionIdFromBody(body);
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  const session = await loadSession(id, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  await deleteSession(id, process.env);
  if (state.sessionId === id) {
    state.convo = undefined;
    state.sessionId = undefined;
    state.sessionStarted = undefined;
    state.providerId = undefined;
    state.modelId = undefined;
    state.currentEvents = undefined;
  }
  sendJson(res, 200, { id });
}

export async function handleTools(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  sendJson(res, 200, live.setup.registry.schemas().map((t) => ({ name: t.name, desc: t.description })));
}

export async function handleCapabilities(state: DesktopState, res: http.ServerResponse): Promise<void> {
  try {
    const live = await ensureDesktopConversation(state);
    sendJson(res, 200, await desktopCapabilities(live.setup.registry.schemas().map((t) => ({ name: t.name, description: t.description }))));
  } catch {
    // Installed skills are useful before first-run provider setup succeeds.
    sendJson(res, 200, await desktopCapabilities([]));
  }
}

export async function handleMessaging(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, desktopMessagingPlatforms(process.env));
}

export async function handleSaveMessaging(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; values?: unknown };
  if (typeof body.id !== "string" || !body.id.trim()) return sendJson(res, 400, { error: "platform id is required" });
  try {
    sendJson(res, 200, await saveDesktopMessagingPlatform(state.root, body.id.trim(), body.values));
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleArtifacts(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await desktopArtifacts(state.root));
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

export type DesktopProviderOption = {
  id: string;
  label: string;
  short: string;
  defaultModel: string;
  models: string[];
  current: boolean;
  savedDefaultModel?: string;
  modelSource: "catalog" | "live";
  discoveryAvailable: boolean;
  discoveryError?: string;
};

export function desktopProviderOptions(env: NodeJS.ProcessEnv, catalog: ProviderEntry[] = PROVIDER_CATALOG): DesktopProviderOption[] {
  const current = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const options = new Map<string, DesktopProviderOption>();
  for (const provider of catalog) {
    const isDefaultProvider = provider.id === current;
    options.set(provider.id, {
      id: provider.id,
      label: provider.label,
      short: provider.short,
      defaultModel: provider.defaultModel,
      models: provider.models,
      current: isDefaultProvider,
      savedDefaultModel: isDefaultProvider ? env.VANTA_MODEL ?? provider.defaultModel : undefined,
      modelSource: "catalog",
      discoveryAvailable: Boolean(providerModelDiscoveryTarget(env, provider.id)),
    });
  }
  for (const [id, provider] of Object.entries(loadUserProviders(env))) {
    const isDefaultProvider = id === current;
    options.set(id, {
      id,
      label: id,
      short: "User-declared OpenAI-compatible provider",
      defaultModel: provider.model ?? "",
      models: provider.model ? [provider.model] : [],
      current: isDefaultProvider,
      savedDefaultModel: isDefaultProvider ? env.VANTA_MODEL ?? provider.model : undefined,
      modelSource: "catalog",
      discoveryAvailable: Boolean(providerModelDiscoveryTarget(env, id)),
    });
  }
  return [...options.values()];
}

export type DesktopCatalogLoader = (env: NodeJS.ProcessEnv) => Promise<ProviderEntry[]>;

async function fetchCatalogJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });
  return response.ok ? response.json() : null;
}

/** Resolve the published catalog once per cache TTL; the bundled catalog is the offline floor. */
export const loadDesktopProviderCatalog: DesktopCatalogLoader = async (env) => {
  const cachePath = join(resolveVantaHome(env), "model-catalog.json");
  const catalog = await resolveCatalog({
    ...diskCacheDeps(cachePath),
    fetchJson: fetchCatalogJson,
    now: Date.now(),
  });
  return catalog.providers;
};

export type DesktopModelDiscoverer = (providerId: string, env: NodeJS.ProcessEnv) => Promise<ModelDiscoveryResult>;

export async function desktopProviderOptionsLive(
  env: NodeJS.ProcessEnv,
  loadCatalog: DesktopCatalogLoader = loadDesktopProviderCatalog,
  providerId?: string,
  discover: DesktopModelDiscoverer = discoverProviderModels,
): Promise<DesktopProviderOption[]> {
  const options = desktopProviderOptions(env, mergeProviderCatalog(await loadCatalog(env)));
  if (!providerId) return options;
  const id = providerId.trim().toLowerCase();
  const result = await discover(id, env);
  return options.map((option) => option.id !== id ? option : {
    ...option,
    models: [...new Set([...result.models, ...option.models])],
    modelSource: result.source,
    discoveryAvailable: result.available,
    discoveryError: result.error,
  });
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

export async function handleModels(res: http.ServerResponse, providerId?: string): Promise<void> {
  sendJson(res, 200, await desktopProviderOptionsLive(process.env, loadDesktopProviderCatalog, providerId));
}

export async function handleSetModel(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { provider?: unknown; model?: unknown; scope?: unknown };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const global = body.scope === "global";
  if (!provider) return sendJson(res, 400, { error: "provider is required" });
  try {
    const selection = resolveDesktopProviderSelection(process.env, provider, model || undefined);
    if (global) {
      const existing = existsSync(envPath(state.root)) ? await readFile(envPath(state.root), "utf8") : "";
      await writeFile(envPath(state.root), upsertEnvMigratingLegacy(existing, { VANTA_PROVIDER: selection.provider, VANTA_MODEL: selection.model }), { mode: 0o600 });
      process.env.VANTA_PROVIDER = selection.provider;
      process.env.VANTA_MODEL = selection.model;
    }
    state.providerId = selection.provider;
    state.modelId = selection.model;
    state.setup && (state.setup.provider = selection.resolved);
    state.convo?.setProvider(selection.resolved, buildSummarizer(selection.resolved));
    const entry = providerById(selection.provider);
    sendJson(res, 200, { provider: selection.provider, model: selection.model, scope: global ? "global" : "session", label: entry?.label ?? selection.provider });
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

export async function handleStopChat(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const controller = state._chatAbort;
  if (!state._chatActive || !controller) return sendJson(res, 409, { error: "no turn is running" });
  controller.abort();
  state._queuedMessage = undefined;
  const event = { label: "Stop requested by operator.", ok: false };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  sendJson(res, 202, { stopping: true });
}

export async function handleQueueChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!state._chatActive) return sendJson(res, 409, { error: "no turn is running" });
  if (state._queuedMessage) return sendJson(res, 409, { error: "one next instruction is already queued" });
  const body = await readJson(req) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return sendJson(res, 400, { error: "message is required" });
  state._queuedMessage = message;
  const event = { label: "Next instruction queued.", ok: true };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  sendJson(res, 202, { queued: true });
}

function interrupted(error: unknown, controller: AbortController): boolean {
  return controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

function classifyDesktopFailure(error: unknown, wasInterrupted: boolean, events: DesktopEvent[]): DesktopRunFailureKind {
  if (wasInterrupted) return "interrupted";
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)} ${events.map((event) => event.label).join(" ")}`.toLowerCase();
  if (/setup|api key|provider is required|no provider|configure/.test(text)) return "setup";
  if (/denied|rejected|not approved|approval/.test(text)) return "user_denied";
  if (/tool|shell_cmd|web_fetch|file_|execute/.test(text)) return "tool";
  if (/model|provider|rate limit|quota|timeout|network|fetch|offline|abort/.test(text)) return "model";
  return "unknown";
}

function recoveryActions(status: DesktopRunReceipt["status"]): DesktopRunReceipt["actions"] {
  return status === "done" ? [] : ["retry_failed_step", "edit_request", "start_from_checkpoint"];
}

function receiptStatusForStoppedReason(stoppedReason: string): Pick<DesktopRunReceipt, "status" | "failureKind"> {
  if (stoppedReason === "done") return { status: "done" };
  if (stoppedReason === "interrupted") return { status: "interrupted", failureKind: "interrupted" };
  return { status: "failed", failureKind: "unknown" };
}

function buildRunReceipt(opts: {
  status: DesktopRunReceipt["status"];
  events: DesktopEvent[];
  instruction: string;
  partialText?: string;
  failureKind?: DesktopRunFailureKind;
}): DesktopRunReceipt {
  return {
    status: opts.status,
    ...(opts.failureKind ? { failureKind: opts.failureKind } : {}),
    events: opts.events.map(({ label, ok }) => ({ label, ok })),
    actions: recoveryActions(opts.status),
    checkpoint: opts.status === "done" ? undefined : { instruction: opts.instruction, ...(opts.partialText ? { partialText: opts.partialText } : {}) },
  };
}

function attachDesktopRunReceipt(convo: Conversation, receipt: DesktopRunReceipt, finalText: string): void {
  const last = convo.messages.at(-1);
  if (last?.role === "assistant") last.desktopRun = receipt;
  else convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
}

export async function handleChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (state._chatActive) return sendJson(res, 409, { error: "a turn is already running" });
  const body = await readJson(req) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return sendJson(res, 400, { error: "message is required" });
  const controller = new AbortController();
  state._chatActive = true;
  state._chatAbort = controller;
  state._chatDeltas = [];
  state._queuedMessage = undefined;
  state._streamTextDeltas = true;
  const events: DesktopEvent[] = [];
  state.currentEvents = events;
  let live: Awaited<ReturnType<typeof ensureDesktopConversation>> | undefined;
  try {
    live = await ensureDesktopConversation(state);
    let instruction = message;
    let outcome: Awaited<ReturnType<typeof live.convo.send>>;
    while (true) {
      if (live.sessionId) await checkpointSessionMessages(live.sessionId, [...live.convo.messages, { role: "user", content: instruction }], process.env);
      outcome = await live.convo.send(instruction, undefined, controller.signal);
      await writeRunMemory({ provider: live.setup.provider, goals: live.setup.goals, instruction, finalText: outcome.finalText });
      events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done" });
      const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events, instruction, partialText: outcome.finalText });
      attachDesktopRunReceipt(live.convo, receipt, outcome.finalText);
      const queued = state._queuedMessage;
      state._queuedMessage = undefined;
      if (!queued || controller.signal.aborted) break;
      instruction = queued;
      const event = { label: "Running queued instruction.", ok: true };
      events.push(event);
      if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
    }
    await persistActiveSession(state);
    const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events, instruction, partialText: outcome.finalText });
    sendJson(res, 200, { finalText: outcome.finalText, events, usage: outcome.usage, sessionId: state.sessionId, receipt });
  } catch (error) {
    const wasInterrupted = interrupted(error, controller);
    const partial = state._chatDeltas?.join("").trim();
    const finalText = partial
      ? `${partial}\n\n${wasInterrupted ? "Stopped by operator." : "The run stopped before completing."}`
      : wasInterrupted ? "Stopped by operator." : error instanceof Error ? error.message : String(error);
    events.push({ label: wasInterrupted ? "Stopped by operator." : "Run failed before completion.", ok: false });
    const receipt = buildRunReceipt({
      status: wasInterrupted ? "interrupted" : "failed",
      events,
      instruction: message,
      partialText: partial || undefined,
      failureKind: classifyDesktopFailure(error, wasInterrupted, events),
    });
    if (live) {
      live.convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
      await persistActiveSession(state);
    }
    sendJson(res, 200, { finalText, events, interrupted: wasInterrupted, sessionId: state.sessionId, receipt });
  } finally {
    state.currentEvents = undefined;
    state._chatDeltas = undefined;
    state._queuedMessage = undefined;
    state._streamTextDeltas = false;
    state._chatActive = false;
    if (state._chatAbort === controller) state._chatAbort = undefined;
  }
}
