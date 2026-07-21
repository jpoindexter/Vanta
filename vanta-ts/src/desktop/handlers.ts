import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createConversation, type StreamEvent } from "../agent.js";
import type { Conversation } from "../agent.js";
import type { DesktopRunFailureKind, DesktopRunReceipt } from "../types.js";
import { buildSummarizer, prepareRun, writeRunMemory } from "../session.js";
import type { RunSetup } from "../session.js";
import { deleteSession, listAllSessions, loadSession, newSessionId, renameSession, saveSession, setSessionArchived, setSessionTrashed, checkpointSessionMessages } from "../sessions/store.js";
import { reorderPinnedSessions, setSessionPinned } from "../sessions/pinning.js";
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
import { resolveEventFormatter, type EventLabel } from "../term/event-format.js";
import { pushSseEvent, type SseClients } from "./session-state.js";
import { approvalDecision, approvalPayload, requestWebApproval, resolveApproval, type PendingApproval } from "./approval.js";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { desktopArtifacts, desktopCapabilities, desktopMessagingPlatforms, saveDesktopMessagingPlatform, testDesktopMessagingPlatform } from "./operator-data.js";
import { loadDesktopAccessMode, permissionModeForAccess, saveDesktopAccessMode, type DesktopAccessMode } from "./access-mode.js";
import { desktopRuntimePayload, runDesktopRuntimeAction, selectDesktopRuntimeHost, type DesktopRuntimeAction } from "./runtime-controller.js";
import { buildDesktopFileContext, isSafeProjectFile } from "./file-context.js";
import { DesktopTurnQueue, QueueConflictError, desktopTurnQueuePath, fileTurnQueueDeps, type QueuedTurnTarget } from "./turn-queue.js";
import { resolveTelegramSetupStatus } from "../setup/telegram-status.js";
import { loadDesktopSessionDraft, saveDesktopSessionDraft } from "./session-draft-store.js";
import { startDesktopGateway } from "./gateway-control.js";
import { redactForLog } from "../store/redact-structural.js";
import { loadProviderAuthRequired, saveProviderAuthRequired, type ProviderAuthRequired } from "./provider-auth-store.js";
import { parseDesktopImageInput } from "./image-input.js";
import { approvedMkdirWritableDirs } from "../tools/shell-cmd.js";
export { approvalDecision, type PendingApproval } from "./approval.js";

const desktopTurnQueues = new Map<string, DesktopTurnQueue>();

export type DesktopEvent = EventLabel & { delta?: string };
export type DesktopState = {
  setup?: RunSetup;
  _setupPromise?: Promise<RunSetup>;
  _setupError?: { message: string; at: number };
  _providerAuthRequired?: ProviderAuthRequired;
  _chatActive?: boolean;
  _chatAbort?: AbortController;
  _chatDeltas?: string[];
  _turnQueue?: DesktopTurnQueue;
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
  runtimeHostBySession?: Record<string, string>;
  _sseSessionId?: string;
  _sseClients?: SseClients;
};

export function eventLabel(event: StreamEvent): DesktopEvent | null {
  // Delegates to the shared StreamEventFormatter port (term/event-format) so the
  // label presentation lives in one swappable place, not inline per surface.
  return resolveEventFormatter().format(event);
}

function providerRouteStatus(state: DesktopState, provider: LLMProvider): {
  provider: string;
  model: string;
  baseRoute: string;
  billingMode: "included" | "metered" | "local" | "unknown";
  authMethod: "subscription" | "api_key" | "local" | "unknown";
  authState: "ready" | "required";
} {
  const route = provider.routeInfo?.();
  const providerId = route?.provider ?? state.providerId ?? process.env.VANTA_PROVIDER ?? "unknown";
  const authMethod: "subscription" | "api_key" | "local" | "unknown" = route?.billingMode === "included" ? "subscription"
    : route?.billingMode === "local" ? "local"
      : providerById(providerId)?.envVar ? "api_key" : "unknown";
  return {
    provider: providerId,
    model: route?.model ?? provider.modelId(),
    baseRoute: redactForLog(route?.baseRoute ?? `provider://${providerId}`),
    billingMode: route?.billingMode ?? "unknown",
    authMethod,
    authState: state._providerAuthRequired ? "required" as const : "ready" as const,
  };
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
    usageTaskId: setup.goals.find((g) => g.status === "active")?.id?.toString(),
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
  state._providerAuthRequired ??= await loadProviderAuthRequired(state.root);
  const live = await ensureDesktopConversation(state);
  const goals = await live.setup.safety.getGoals().catch(() => live.setup.goals);
  sendJson(res, 200, { kernel: "online", model: live.setup.provider.modelId(), provider: live.providerId ?? process.env.VANTA_PROVIDER ?? "openai", providerRoute: providerRouteStatus(state, live.setup.provider), tools: live.setup.registry.list().length, sessionId: live.sessionId, root: state.root, goals: goals.filter((g) => g.status === "active"), accessMode: live.accessMode, accessScope: "project" });
}

export async function handleTelegramSetupStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await resolveTelegramSetupStatus(process.env, join(state.root, ".vanta")));
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

function runtimeRequest(body: { hostId?: unknown; action?: unknown }): { hostId: string; action?: DesktopRuntimeAction } {
  if (typeof body.hostId !== "string" || !body.hostId.trim()) throw new Error("hostId is required");
  const actions: DesktopRuntimeAction[] = ["launch", "stop", "retry", "reconnect"];
  if (body.action === undefined) return { hostId: body.hostId };
  if (typeof body.action !== "string" || !actions.includes(body.action as DesktopRuntimeAction)) throw new Error("invalid runtime action");
  return { hostId: body.hostId, action: body.action as DesktopRuntimeAction };
}

export async function handleRuntime(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const queueDepth = (await turnQueue(state).list(queueSessionId(state))).items.length;
  const runtimeState = {
    root: state.root,
    sessionId: state.sessionId,
    queueDepth,
    runtimeHostBySession: state.runtimeHostBySession,
  };
  if (req.method === "GET") return sendJson(res, 200, await desktopRuntimePayload(runtimeState));
  const body = await readJson(req) as { hostId?: unknown; action?: unknown };
  try {
    const parsed = runtimeRequest(body);
    const payload = parsed.action ? await runDesktopRuntimeAction(runtimeState, parsed.hostId, parsed.action) : await selectDesktopRuntimeHost(runtimeState, parsed.hostId);
    state.runtimeHostBySession = runtimeState.runtimeHostBySession;
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
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

type DeleteSessionRequest = { id: string; trashed: boolean; permanent: boolean };

function parseDeleteSessionRequest(body: { id?: unknown; trashed?: unknown; permanent?: unknown }): DeleteSessionRequest | { error: string } {
  const id = sessionIdFromBody(body);
  if (!id) return { error: "session id is required" };
  if (body.trashed !== undefined && typeof body.trashed !== "boolean") return { error: "trashed must be boolean" };
  if (body.permanent !== undefined && typeof body.permanent !== "boolean") return { error: "permanent must be boolean" };
  return { id, trashed: body.trashed ?? true, permanent: body.permanent === true };
}

function clearActiveSession(state: DesktopState, id: string, shouldClear: boolean): void {
  if (state.sessionId !== id || !shouldClear) return;
  state.convo = undefined; state.sessionId = undefined; state.sessionStarted = undefined;
  state.providerId = undefined; state.modelId = undefined; state.currentEvents = undefined;
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

export async function handlePinSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; pinned?: unknown };
  const id = sessionIdFromBody(body);
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (typeof body.pinned !== "boolean") return sendJson(res, 400, { error: "pinned must be boolean" });
  const session = await setSessionPinned(id, body.pinned, process.env);
  if (!session) return sendJson(res, 404, { error: "active session not found" });
  sendJson(res, 200, { id: session.id, pinned: Boolean(session.pinned), pinOrder: session.pinOrder });
}

export async function handleReorderPinnedSessions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { orderedIds?: unknown };
  if (!Array.isArray(body.orderedIds) || body.orderedIds.some((id) => typeof id !== "string" || !id)) {
    return sendJson(res, 400, { error: "orderedIds must be a list of session ids" });
  }
  const sessions = await reorderPinnedSessions(body.orderedIds as string[], process.env);
  if (!sessions) return sendJson(res, 409, { error: "pinned session order is stale; refresh and retry" });
  sendJson(res, 200, { orderedIds: sessions.filter((session) => !session.archived && !session.trashed).map((session) => session.id) });
}

export async function handleDeleteSession(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { id?: unknown; trashed?: unknown; permanent?: unknown };
  const parsed = parseDeleteSessionRequest(body);
  if ("error" in parsed) return sendJson(res, 400, parsed);
  const { id, permanent, trashed } = parsed;
  const session = await loadSession(id, process.env);
  if (!session) return sendJson(res, 404, { error: "session not found" });
  if (permanent) await deleteSession(id, process.env);
  else await setSessionTrashed(id, trashed, process.env);
  clearActiveSession(state, id, permanent || trashed);
  sendJson(res, 200, { id, trashed: permanent ? undefined : trashed, permanent });
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

export async function handleConnectTest(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { kind?: unknown; id?: unknown };
  if (body.kind === "messaging" && typeof body.id === "string") {
    return sendJson(res, 200, await testDesktopMessagingPlatform(body.id));
  }
  if (body.kind === "provider") {
    try {
      const live = await ensureDesktopConversation(state);
      const label = providerById(live.providerId ?? "")?.label ?? live.providerId ?? "Current provider";
      return sendJson(res, 200, { status: "ready", message: `${label} is resolved with model ${live.modelId}.` });
    } catch (error) {
      return sendJson(res, 200, { status: "needs_setup", message: (error as Error).message.split("\n")[0] });
    }
  }
  sendJson(res, 400, { error: "kind must be provider or messaging" });
}

export async function handleGatewayStart(state: DesktopState, res: http.ServerResponse): Promise<void> {
  try {
    sendJson(res, 200, await startDesktopGateway(state.root));
  } catch (error) {
    sendJson(res, 500, { state: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleArtifacts(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await desktopArtifacts(state.root));
}

export async function handleFiles(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const files = await listRepoFiles(state.root, 3, true);
  sendJson(res, 200, files.filter(isSafeProjectFile).slice(0, 400));
}

export async function handleFileContext(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await buildDesktopFileContext(state.root));
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
      discoveryAvailable: provider.id === "codex" || Boolean(providerModelDiscoveryTarget(env, provider.id)),
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
    models: id === "codex" && result.source === "live"
      ? result.models
      : [...new Set([...result.models, ...option.models])],
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
  const result = await tool.execute({
    command,
  }, {
    root: state.root,
    sessionId: state.sessionId,
    safety: live.setup.safety,
    requestApproval: (action: string, reason: string) => requestWebApproval(state, action, reason, "shell_cmd"),
    sandboxWritableDirs: verdict.risk === "ask" ? approvedMkdirWritableDirs(command, state.root) : undefined,
  });
  sendJson(res, 200, result);
}

export async function handleStopChat(state: DesktopState, res: http.ServerResponse): Promise<void> {
  const controller = state._chatAbort;
  if (!state._chatActive || !controller) return sendJson(res, 409, { error: "no turn is running" });
  controller.abort();
  const event = { label: "Stop requested by operator.", ok: false };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  sendJson(res, 202, { stopping: true });
}

function turnQueue(state: DesktopState): DesktopTurnQueue {
  if (state._turnQueue) return state._turnQueue;
  const path = desktopTurnQueuePath(state.root);
  let queue = desktopTurnQueues.get(path);
  if (!queue) {
    queue = new DesktopTurnQueue(fileTurnQueueDeps(path));
    desktopTurnQueues.set(path, queue);
  }
  state._turnQueue = queue;
  return state._turnQueue;
}

function queueSessionId(state: DesktopState): string {
  return state.sessionId ?? state._sseSessionId ?? "default";
}

function queuedTurnTarget(state: DesktopState): QueuedTurnTarget {
  const sessionId = queueSessionId(state);
  return {
    sessionId,
    root: state.root,
    controllerId: state.runtimeHostBySession?.[sessionId] ?? "local",
    model: state.modelId ?? state.setup?.provider.modelId() ?? "default",
    accessMode: state.accessMode ?? "approve",
  };
}

export async function handleQueueList(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await turnQueue(state).list(queueSessionId(state)));
}

export async function handleSessionDraft(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { action?: unknown; id?: unknown; value?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return sendJson(res, 400, { error: "session id is required" });
  if (body.action === "load") return sendJson(res, 200, await loadDesktopSessionDraft(state.root, id));
  if (body.action === "save" && typeof body.value === "string") {
    await saveDesktopSessionDraft(state.root, id, body.value);
    return sendJson(res, 200, { saved: true });
  }
  sendJson(res, 400, { error: "unsupported draft action" });
}

export async function handleQueueChat(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { action?: unknown; id?: unknown; revision?: unknown; message?: unknown; direction?: unknown };
  const action = typeof body.action === "string" ? body.action : "enqueue";
  const queue = turnQueue(state);
  try {
    if (action === "enqueue") {
      if (!state._chatActive) return sendJson(res, 409, { error: "no turn is running" });
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return sendJson(res, 400, { error: "message is required" });
      const item = await queue.enqueue({ instruction: message, target: queuedTurnTarget(state) });
      const event = { label: "Next instruction queued.", ok: true };
      state.currentEvents?.push(event);
      if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
      return sendJson(res, 202, { queued: true, item, snapshot: await queue.list(queueSessionId(state)) });
    }
    const id = typeof body.id === "string" ? body.id : "";
    const revision = typeof body.revision === "number" ? body.revision : -1;
    if (!id || revision < 0) return sendJson(res, 400, { error: "id and revision are required" });
    if (action === "edit") await queue.edit(id, revision, typeof body.message === "string" ? body.message : "");
    else if (action === "move" && (body.direction === "up" || body.direction === "down")) await queue.move(id, revision, body.direction);
    else if (action === "cancel") await queue.cancel(id, revision);
    else if (action === "steer") await queue.steer(id, revision);
    else return sendJson(res, 400, { error: "unsupported queue action" });
    sendJson(res, 200, await queue.list(queueSessionId(state)));
  } catch (error) {
    if (error instanceof QueueConflictError) return sendJson(res, 409, { error: error.message, code: error.code, snapshot: await queue.list(queueSessionId(state)) });
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function interrupted(error: unknown, controller: AbortController): boolean {
  return controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

function classifyDesktopFailure(error: unknown, wasInterrupted: boolean, events: DesktopEvent[]): DesktopRunFailureKind {
  if (wasInterrupted) return "interrupted";
  const text = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)} ${events.map((event) => event.label).join(" ")}`.toLowerCase();
  if (/\b401\b|incorrect api key|invalid api key|authentication|unauthorized|oauth|credential|token (?:expired|revoked|refresh)|login required|not authorized/.test(text)) return "provider_auth";
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
    events: opts.events.map((event) => ({ ...event })),
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
  const body = await readJson(req) as { message?: unknown; images?: unknown };
  const parsedImages = parseDesktopImageInput(body.images);
  if (!parsedImages.ok) return sendJson(res, 400, { error: parsedImages.error });
  const images = parsedImages.images;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const instructionText = message || (images.length ? "Describe the attached image." : "");
  if (!instructionText) return sendJson(res, 400, { error: "message or image is required" });
  state._providerAuthRequired ??= await loadProviderAuthRequired(state.root);
  if (state._providerAuthRequired) {
    const finalText = `Provider authentication required for ${state._providerAuthRequired.provider} · ${state._providerAuthRequired.model}. Reconnect this model in Connect before retrying.`;
    const receipt = buildRunReceipt({ status: "failed", failureKind: "provider_auth", events: [{ label: "Provider authentication required.", ok: false }], instruction: instructionText });
    receipt.actions = ["edit_request", "start_from_checkpoint"];
    const live = await ensureDesktopConversation(state);
    live.convo.messages.push({ role: "user", content: instructionText, ...(images.length ? { images } : {}) }, { role: "assistant", content: finalText, desktopRun: receipt });
    await persistActiveSession(state);
    return sendJson(res, 200, { finalText, events: receipt.events, sessionId: state.sessionId, receipt });
  }
  const controller = new AbortController();
  state._chatActive = true;
  state._chatAbort = controller;
  state._chatDeltas = [];
  state._streamTextDeltas = true;
  const events: DesktopEvent[] = [];
  state.currentEvents = events;
  let live: Awaited<ReturnType<typeof ensureDesktopConversation>> | undefined;
  const activeQueueSessionId = queueSessionId(state);
  let claimedTurnId: string | undefined;
  try {
    live = await ensureDesktopConversation(state);
    let instruction = instructionText;
    let instructionImages = images.length ? images : undefined;
    let outcome: Awaited<ReturnType<typeof live.convo.send>>;
    while (true) {
      if (live.sessionId) await checkpointSessionMessages(live.sessionId, [...live.convo.messages, { role: "user", content: instruction, ...(instructionImages ? { images: instructionImages } : {}) }], process.env);
      outcome = await live.convo.send(instruction, instructionImages, controller.signal);
      instructionImages = undefined;
      await writeRunMemory({ provider: live.setup.provider, goals: live.setup.goals, instruction, finalText: outcome.finalText });
      events.push({ label: `${outcome.stoppedReason} · ${outcome.iterations} iteration(s)`, ok: outcome.stoppedReason === "done", kind: "summary" });
      const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events, instruction, partialText: outcome.finalText });
      attachDesktopRunReceipt(live.convo, receipt, outcome.finalText);
      if (claimedTurnId) {
        if (outcome.stoppedReason === "done") await turnQueue(state).complete(claimedTurnId);
        else await turnQueue(state).release(claimedTurnId);
        claimedTurnId = undefined;
      }
      if (outcome.stoppedReason !== "done") break;
      if (controller.signal.aborted) break;
      const queued = await turnQueue(state).claimNext(activeQueueSessionId);
      if (!queued) break;
      claimedTurnId = queued.id;
      instruction = queued.instruction;
      const event = { label: queued.intent === "steer" ? "Applying queued steer instruction." : "Running queued instruction.", ok: true };
      events.push(event);
      if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
    }
    await persistActiveSession(state);
    const receipt = buildRunReceipt({ ...receiptStatusForStoppedReason(outcome.stoppedReason), events, instruction, partialText: outcome.finalText });
    sendJson(res, 200, { finalText: outcome.finalText, events, usage: outcome.usage, sessionId: state.sessionId, receipt });
  } catch (error) {
    if (claimedTurnId) await turnQueue(state).release(claimedTurnId).catch(() => undefined);
    const wasInterrupted = interrupted(error, controller);
    const partial = state._chatDeltas?.join("").trim();
    const failureKind = classifyDesktopFailure(error, wasInterrupted, events);
    if (failureKind === "provider_auth" && live) {
      const route = providerRouteStatus(state, live.setup.provider);
      state._providerAuthRequired = {
        provider: route.provider,
        model: route.model,
        baseRoute: route.baseRoute,
        billingMode: route.billingMode,
        authMethod: route.authMethod,
      };
      await saveProviderAuthRequired(state.root, state._providerAuthRequired);
    }
    const safeError = redactForLog(error instanceof Error ? error.message : String(error));
    const finalText = partial
      ? `${partial}\n\n${wasInterrupted ? "Stopped by operator." : "The run stopped before completing."}`
      : wasInterrupted ? "Stopped by operator."
        : failureKind === "provider_auth" && state._providerAuthRequired
          ? `Provider authentication required for ${state._providerAuthRequired.provider} · ${state._providerAuthRequired.model}. Reconnect this model in Connect before retrying.`
          : safeError;
    events.push({ label: wasInterrupted ? "Stopped by operator." : failureKind === "provider_auth" ? "Provider authentication required." : "Run failed before completion.", ok: false });
    const receipt = buildRunReceipt({
      status: wasInterrupted ? "interrupted" : "failed",
      events,
      instruction: instructionText,
      partialText: partial || undefined,
      failureKind,
    });
    if (failureKind === "provider_auth") receipt.actions = ["edit_request", "start_from_checkpoint"];
    if (live) {
      live.convo.messages.push({ role: "assistant", content: finalText, desktopRun: receipt });
      await persistActiveSession(state);
    }
    sendJson(res, 200, { finalText, events, interrupted: wasInterrupted, sessionId: state.sessionId, receipt });
  } finally {
    state.currentEvents = undefined;
    state._chatDeltas = undefined;
    state._streamTextDeltas = false;
    state._chatActive = false;
    if (state._chatAbort === controller) state._chatAbort = undefined;
  }
}
