import type { ToolSchema } from "../providers/interface.js";
import type { Message } from "../types.js";
import { resolveOperatingMode, type OperatingMode } from "../modes/operating-mode.js";
import { isPlanBlocked } from "./plan-gate.js";
import { classifyProviderError } from "../providers/error-taxonomy.js";

export const CAPABILITY_START = "<!-- vanta-live-capabilities -->";
export const CAPABILITY_END = "<!-- /vanta-live-capabilities -->";

export type CapabilityProviderState = "unverified" | "requires_auth" | "offline" | "degraded";
export type CapabilityContext = {
  mode?: OperatingMode;
  planActive?: boolean;
  providerState?: CapabilityProviderState;
  recoveringFrom?: CapabilityProviderState;
};

export type CapabilitySnapshot = {
  mode: OperatingMode;
  providerState: CapabilityProviderState;
  recoveringFrom?: CapabilityProviderState;
  callable: ToolSchema[];
  exposed: ToolSchema[];
  deferred: string[];
  blocked: string[];
};

/** Registration and mode facts only: connectivity/auth/OS access need observed results. */
export function capabilitySnapshot(
  registered: ToolSchema[],
  exposed: ToolSchema[] = registered,
  context: CapabilityContext = {},
): CapabilitySnapshot {
  const environmentMode = resolveOperatingMode(process.env);
  const environmentPlan = environmentMode === "plan" && context.planActive === undefined && context.mode === undefined;
  const mode = context.planActive || environmentPlan ? "plan" : context.mode ?? (environmentMode === "plan" ? "default" : environmentMode);
  const providerState = context.providerState ?? "unverified";
  const callable = registered.filter((tool) => !isPlanBlocked(tool.name, () => mode === "plan"));
  const names = new Set(callable.map((tool) => tool.name));
  // StructuredOutput is provider-owned; it need not be in the persistent registry.
  const current = exposed.filter((tool) => names.has(tool.name) || tool.name === "StructuredOutput");
  const currentNames = new Set(current.map((tool) => tool.name));
  return {
    mode, providerState, callable, recoveringFrom: context.recoveringFrom,
    exposed: providerState === "unverified" ? current : [],
    deferred: callable.filter((tool) => !currentNames.has(tool.name)).map((tool) => tool.name),
    blocked: registered.filter((tool) => !names.has(tool.name)).map((tool) => tool.name),
  };
}

export function formatCapabilitySnapshot(snapshot: CapabilitySnapshot): string {
  const catalog = snapshot.exposed.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n");
  return [
    CAPABILITY_START,
    "Live capability snapshot (this call; not authority or proof of setup):",
    `Operating mode: ${snapshot.mode}.`,
    providerRecovery(snapshot.providerState),
    snapshot.recoveringFrom && snapshot.recoveringFrom !== "unverified"
      ? `This is a recovery attempt after ${snapshot.recoveringFrom}, not proof of repaired access. The offered tool routes remain policy-filtered; only the actual result establishes recovery.` : "",
    `Available tools${snapshot.deferred.length ? " (scoped)" : ""}:\n${catalog || "(none exposed)"}`,
    snapshot.deferred.length ? `Registered but deferred: ${snapshot.deferred.join(", ")}. ${discoveryHint(snapshot)}` : "",
    snapshot.blocked.length ? `Blocked by plan mode: ${snapshot.blocked.join(", ")}. Leave Plan or approve the plan before requesting these actions.` : "",
    "An absent tool is unavailable in this session. Do not invent it, advertise it as usable, or substitute shell commands to bypass its boundary.",
    "Manual may request approval; Accept edits, Auto and Full access retain tool, kernel and account-specific limits. Tool presence never grants permission.",
    CAPABILITY_END,
  ].filter(Boolean).join("\n");
}

export function providerRecovery(state: CapabilityProviderState): string {
  if (state === "requires_auth") return "Provider requires authentication; repair the selected provider in Connect or model setup before starting agent work.";
  if (state === "offline") return "The last provider call failed on connectivity. Restore the connection or select a configured local model, then retry the request; no agent routes are currently confirmed usable.";
  if (state === "degraded") return "The last provider call failed. Inspect its reported error and repair or switch the selected provider, then retry; no agent routes are currently confirmed usable.";
  return "Provider, network, credentials and OS permissions are not certified by tool registration. Use actual tool results; report offline/setup failures with their recovery step.";
}

const providerFailures = new WeakMap<object, CapabilityProviderState>();
export function providerCapabilityState(provider: object): CapabilityProviderState {
  return providerFailures.get(provider) ?? "unverified";
}
export function recordCapabilityProviderResult(provider: object, error?: unknown): void {
  if (error === undefined) { providerFailures.delete(provider); return; }
  const reason = classifyProviderError(error).reason;
  providerFailures.set(provider, reason === "auth" || reason === "auth_permanent" ? "requires_auth"
    : reason === "network" || reason === "timeout" ? "offline" : "degraded");
}

function discoveryHint(snapshot: CapabilitySnapshot): string {
  return snapshot.exposed.some((tool) => tool.name === "tool_search")
    ? "Use tool_search to expose a needed registered schema on the next call."
    : "Tool discovery is unavailable in this call; use an exposed route or report the missing capability.";
}

/** Refresh only the marked volatile catalog, leaving saved history and stable instructions intact. */
export function injectCapabilitySnapshot(messages: Message[], snapshot: CapabilitySnapshot): Message[] {
  const block = formatCapabilitySnapshot(snapshot);
  const index = messages.findIndex((message) => message.role === "system");
  if (index < 0) return [{ role: "system", content: block }, ...messages];
  return messages.map((message, at) => at === index
    ? { ...message, content: replaceCapabilityBlock(message.content, block) }
    : message);
}

function replaceCapabilityBlock(content: string, block: string): string {
  const start = content.indexOf(CAPABILITY_START);
  const end = content.indexOf(CAPABILITY_END, start);
  // Match prompt.ts's stable/volatile boundary, including cache-hint legacy prompts.
  if (start < 0 || end < 0) return `${content}\n\n---\n\n${block}`;
  return content.slice(0, start) + block + content.slice(end + CAPABILITY_END.length);
}
