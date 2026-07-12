export const VANTA_API_VERSION = "v1" as const;
export const VANTA_PLUGIN_CONTRACT_VERSION = 1 as const;

export type VantaLiveness = { apiVersion: "v1"; status: "live" };
export type VantaReadiness = {
  apiVersion: "v1";
  status: "ready" | "degraded";
  checks: Record<string, { status: string; [key: string]: string | number }>;
};

export type VantaSession = {
  id: string;
  title: string;
  started: string;
  updated: string;
  projectId?: string;
  turns: number;
};

export type VantaMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  [key: string]: unknown;
};

export type VantaOpenedSession = { id: string; title: string; messages: VantaMessage[] };
export type VantaTurn = {
  finalText: string;
  events: Array<{ label: string; ok?: boolean; delta?: string }>;
  usage?: { inputTokens: number; outputTokens: number };
  sessionId: string;
};

export type VantaApprovalDecision = "allow" | "always" | "deny" | "never";
export type VantaApproval = {
  id: string;
  action: string;
  reason: string;
  toolName?: string;
  request?: unknown;
};

export type VantaOutputDelta = {
  apiVersion: typeof VANTA_API_VERSION;
  type: "output.delta";
  sessionId: string;
  delta: string;
};
export type VantaActivity = {
  apiVersion: typeof VANTA_API_VERSION;
  type: "activity";
  sessionId: string;
  label: string;
  ok?: boolean;
};
export type VantaTurnCompleted = {
  apiVersion: typeof VANTA_API_VERSION;
  type: "turn.completed";
  sessionId: string;
  ok: boolean;
};
export type VantaEvent = VantaOutputDelta | VantaActivity | VantaTurnCompleted;

export type VantaPluginManifestV1 = {
  contractVersion: typeof VANTA_PLUGIN_CONTRACT_VERSION;
  id: string;
  name: string;
  version: string;
  entrypoint: string;
  capabilities: string[];
};

export function isVantaPluginManifestV1(value: unknown): value is VantaPluginManifestV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.contractVersion === 1
    && ["id", "name", "version", "entrypoint"].every((key) => typeof item[key] === "string" && item[key] !== "")
    && Array.isArray(item.capabilities)
    && item.capabilities.every((capability) => typeof capability === "string");
}
