import http from "node:http";
import { join } from "node:path";
import { readCanvasArtifact } from "../canvas/artifact.js";
import { providerById } from "../providers/catalog.js";
import { setPlanInstruction } from "../repl/plan-mode.js";
import { resolveTelegramSetupStatus } from "../setup/telegram-status.js";
import { listRepoFiles } from "../term/at-context.js";
import { desktopAccessModeLabel,isDesktopAccessMode,saveDesktopAccessMode } from "./access-mode.js";
import { buildDesktopFileContext,isSafeProjectFile } from "./file-context.js";
import { startDesktopGateway } from "./gateway-control.js";
import { ensureDesktopConversation,providerRouteStatus } from "./handler-conversation.js";
import { readJson,sendJson } from "./handler-http.js";
import { currentDesktopModelSettings } from "./handler-model-state.js";
import { queueSessionId,turnQueue } from "./handler-queue.js";
import { type DesktopState } from "./handler-state.js";
import { desktopArtifacts,desktopCapabilities,desktopMessagingPlatforms,saveDesktopMessagingPlatform,testDesktopMessagingPlatform } from "./operator-data.js";
import { loadProviderAuthRequired } from "./provider-auth-store.js";
import { desktopRuntimePayload,runDesktopRuntimeAction,selectDesktopRuntimeHost,type DesktopRuntimeAction } from "./runtime-controller.js";
import { pushSseEvent } from "./session-state.js";

export async function handleStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  state._providerAuthRequired ??= await loadProviderAuthRequired(state.root);
  const live = await ensureDesktopConversation(state);
  const goals = await live.setup.safety.getGoals().catch(() => live.setup.goals);
  sendJson(res, 200, { kernel: "online", model: live.setup.provider.modelId(), provider: live.providerId ?? process.env.VANTA_PROVIDER ?? "openai", modelSettings: currentDesktopModelSettings(live), providerRoute: providerRouteStatus(state, live.setup.provider), tools: live.setup.registry.list().length, sessionId: live.sessionId, root: state.root, goals: goals.filter((g) => g.status === "active"), accessMode: live.accessMode, accessScope: "project" });
}

export async function handleTelegramSetupStatus(state: DesktopState, res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await resolveTelegramSetupStatus(process.env, join(state.root, ".vanta")));
}

export async function handleAccessMode(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  if (req.method === "GET") return sendJson(res, 200, { mode: live.accessMode, scope: "project" });
  const body = await readJson(req) as { mode?: unknown };
  if (!isDesktopAccessMode(body.mode)) {
    return sendJson(res, 400, { error: "mode must be ask, approve, plan, auto, or full" });
  }
  await saveDesktopAccessMode(state.root, body.mode);
  state.accessMode = body.mode;
  setPlanInstruction(live.convo.messages, body.mode === "plan");
  const label = desktopAccessModeLabel(body.mode);
  const event = { label: `Access mode changed to ${label} for this project.`, ok: true };
  state.currentEvents?.push(event);
  if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, event);
  await live.setup.safety.logEvent(JSON.stringify({ kind: "desktop_access_mode", mode: body.mode, scope: "project" })).catch(() => {});
  sendJson(res, 200, { mode: body.mode, scope: "project" });
}

export function runtimeRequest(body: { hostId?: unknown; action?: unknown }): { hostId: string; action?: DesktopRuntimeAction } {
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
