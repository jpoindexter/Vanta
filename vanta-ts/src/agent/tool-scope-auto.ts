import { estTokens } from "winnow";
import type { ToolSchema } from "../providers/interface.js";

/**
 * AUTO tool-scoping: decide whether to defer (subset behind tool_search) the
 * full tool-schema set, or expose it inline. Deferring costs an extra
 * round-trip when the model needs a hidden tool, so it only pays off once the
 * inline schemas would consume a meaningful slice of context. Below the
 * threshold, inline is cheaper and avoids that round-trip.
 *
 * Modes (env `VANTA_TOOL_SCOPE`):
 *   - "on"   — always defer (the historical default; preserved for unset env)
 *   - "off"  — never defer (full inline exposure; legacy "0" maps here)
 *   - "auto" — defer only when the estimated schema tokens exceed the threshold
 */
export type ToolScopeMode = "auto" | "on" | "off";

/** Default token budget above which AUTO mode defers the schema set. */
export const DEFAULT_TOOL_SCOPE_THRESHOLD = 2000;

/**
 * Estimate the token cost of advertising these schemas to the provider. Each
 * schema bills its name + description + serialized JSON parameters; the sum is
 * a deterministic, provider-agnostic estimate (no network, pure).
 */
export function estimateSchemaTokens(schemas: ToolSchema[]): number {
  let total = 0;
  for (const schema of schemas) {
    total += estTokens(serializeSchema(schema));
  }
  return total;
}

/**
 * Resolve the scope mode from env, preserving current behavior by default:
 * unset / unrecognized → "on" (always defer above the count floor); "0",
 * "off", "false", "never", "none" → "off"; "auto" → threshold-gated.
 */
export function resolveToolScopeMode(env?: NodeJS.ProcessEnv): ToolScopeMode {
  const raw = (env?.VANTA_TOOL_SCOPE ?? "").trim().toLowerCase();
  if (raw === "auto") return "auto";
  if (raw === "0" || raw === "off" || raw === "false" || raw === "never" || raw === "none") return "off";
  return "on";
}

/**
 * Whether the full schema set should be deferred behind tool_search.
 *   off  → never (false)
 *   on   → always (true)
 *   auto → only when the estimate exceeds VANTA_TOOL_SCOPE_THRESHOLD
 */
export function shouldDeferTools(schemas: ToolSchema[], env?: NodeJS.ProcessEnv): boolean {
  const mode = resolveToolScopeMode(env);
  if (mode === "off") return false;
  if (mode === "on") return true;
  return estimateSchemaTokens(schemas) > resolveThreshold(env);
}

function resolveThreshold(env?: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt((env?.VANTA_TOOL_SCOPE_THRESHOLD ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOOL_SCOPE_THRESHOLD;
}

function serializeSchema(schema: ToolSchema): string {
  return `${schema.name}\n${schema.description}\n${JSON.stringify(schema.parameters)}`;
}
