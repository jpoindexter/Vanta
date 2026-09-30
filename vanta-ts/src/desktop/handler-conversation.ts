import { createConversation,type StreamEvent } from "../agent.js";
import { providerById } from "../providers/catalog.js";
import type { LLMProvider } from "../providers/interface.js";
import { defaultProviderModelSettings } from "../providers/model-settings.js";
import { setPlanInstruction } from "../repl/plan-mode.js";
import { runEventFromTool } from "../runs/store.js";
import type { RunSetup } from "../session.js";
import { buildSummarizer,prepareRun } from "../session.js";
import { providerIdFor } from "../sessions/model-scope.js";
import { newSessionId,saveSession } from "../sessions/store.js";
import { redactForLog } from "../store/redact-structural.js";
import { resolveEventFormatter } from "../term/event-format.js";
import { loadDesktopAccessMode,permissionModeForAccess } from "./access-mode.js";
import { requestWebApproval } from "./approval.js";
import { type DesktopEvent,type DesktopState } from "./handler-state.js";
import { pushSseEvent } from "./session-state.js";

export function eventLabel(event: StreamEvent): DesktopEvent | null {
  // Delegates to the shared StreamEventFormatter port (term/event-format) so the
  // label presentation lives in one swappable place, not inline per surface.
  return resolveEventFormatter().format(event);
}

export function providerRouteStatus(state: DesktopState, provider: LLMProvider): {
  provider: string;
  model: string;
  baseRoute: string;
  billingMode: "included" | "metered" | "local" | "unknown";
  authMethod: "subscription" | "api_key" | "local" | "unknown";
  authState: "ready" | "required";
} {
  const route = provider.routeInfo?.();
  const providerId = route?.provider ?? state.providerId ?? process.env.VANTA_PROVIDER ?? "unknown";
  const authMethod = providerAuthMethod(route?.billingMode, providerId);
  return {
    provider: providerId,
    model: route?.model ?? provider.modelId(),
    baseRoute: redactForLog(route?.baseRoute ?? `provider://${providerId}`),
    billingMode: route?.billingMode ?? "unknown",
    authMethod,
    authState: state._providerAuthRequired ? "required" as const : "ready" as const,
  };
}

function providerAuthMethod(billingMode: string | undefined, providerId: string): "subscription" | "api_key" | "local" | "unknown" {
  if (billingMode === "included") return "subscription";
  if (billingMode === "local") return "local";
  return providerById(providerId)?.envVar ? "api_key" : "unknown";
}

export function attachConversation(state: DesktopState, setup: RunSetup, history?: Parameters<typeof createConversation>[2]): void {
  const convo = createConversation(setup.systemPrompt, {
    provider: setup.provider, safety: setup.safety, registry: setup.registry, root: state.root,
    sessionId: state.sessionId,
    usageAgent: "desktop",
    usageTaskId: setup.goals.find((g) => g.status === "active")?.id?.toString(),
    requestApproval: (action, reason, toolName, detail) => requestWebApproval(state, action, reason, { toolName, detail }),
    permissionMode: () => permissionModeForAccess(state.accessMode ?? "approve"),
    planGate: () => state.accessMode === "plan",
    forceFreshApproval: () => state.forceFreshApprovals === true,
    maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
    getEffortLevel: () => state.effortLevel ?? setup.effortLevel,
    getServiceTier: () => state.providerSpeed,
    summarize: buildSummarizer(setup.provider),
    activeGoalText: setup.goals.find((g) => g.status === "active")?.text,
    onTextDelta: (delta) => {
      state._chatDeltas?.push(delta);
      if (state._streamTextDeltas && state._sseClients && state._sseSessionId) {
        pushSseEvent(state._sseClients, state._sseSessionId, { label: "", delta });
      }
    },
    onEvent: (event) => {
      if (event.type === "tool_start" || event.type === "tool_end") {
        state.currentRunEvents?.push(runEventFromTool(event));
      }
      const label = eventLabel(event);
      if (label) {
        state.currentEvents?.push(label);
        if (state._sseClients && state._sseSessionId) pushSseEvent(state._sseClients, state._sseSessionId, label);
      }
    },
  }, history);
  setPlanInstruction(convo.messages, state.accessMode === "plan");
  state.convo = convo;
}

export async function ensureDesktopConversation(state: DesktopState): Promise<Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState> {
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
  const modelSettings = defaultProviderModelSettings(state.providerId, state.modelId, {
    effortLevel: state.effortLevel ?? state.setup.effortLevel,
    speed: state.providerSpeed ?? process.env.VANTA_SERVICE_TIER,
  });
  state.effortLevel = modelSettings.effortLevel;
  state.providerSpeed = modelSettings.speed;
  if (!state.convo) attachConversation(state, state.setup);
  return state as Required<Pick<DesktopState, "setup" | "convo" | "root">> & DesktopState;
}

export async function persistActiveSession(state: DesktopState): Promise<void> {
  if (!state.convo || !state.sessionId) return;
  await saveSession(state.sessionId, state.convo.messages, { started: state.sessionStarted, providerId: state.providerId, modelId: state.modelId });
}
