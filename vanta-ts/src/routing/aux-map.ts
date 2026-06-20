// AUX-MAP: per-function model routing. Maps named auxiliary task types to their
// optimal model tier / override, so a text-only primary model (DeepSeek, Ollama)
// doesn't silently fail on vision or expensive summarisation work.
//
// Each function type maps to an env var that overrides VANTA_MODEL for that
// specific call, leaving VANTA_PROVIDER unchanged (same pattern as AUX-VISION).
// When the env var is absent, falls back to the active provider — no-op by default.

import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";

/**
 * Named auxiliary function types. Each has a dedicated env override so operators
 * can route specific work to a purpose-fit model without changing the main model.
 */
export type AuxFunction =
  | "vision"      // image description / OCR / screenshot analysis
  | "summarize"   // long-context compression / summarization
  | "title"       // short label generation from content
  | "embed"       // text embedding (future; placeholder)
  | "classify"    // cheap classification / tagging
  | "prune"       // context pruning / token-scoring
  | "code";       // code-specific model (e.g. deepseek-coder)

/** Env var for each function type. Absent → fall back to active provider. */
const AUX_ENV_VARS: Record<AuxFunction, string> = {
  vision:   "VANTA_MODEL_VISION",
  summarize:"VANTA_MODEL_SUMMARIZE",
  title:    "VANTA_MODEL_TITLE",
  embed:    "VANTA_MODEL_EMBED",
  classify: "VANTA_MODEL_CLASSIFY",
  prune:    "VANTA_MODEL_PRUNE",
  code:     "VANTA_MODEL_CODE",
};

/** Optional provider override per function (e.g. vision on a different provider). */
const AUX_PROVIDER_ENV_VARS: Record<AuxFunction, string> = {
  vision:   "VANTA_VISION_PROVIDER",
  summarize:"VANTA_SUMMARIZE_PROVIDER",
  title:    "VANTA_TITLE_PROVIDER",
  embed:    "VANTA_EMBED_PROVIDER",
  classify: "VANTA_CLASSIFY_PROVIDER",
  prune:    "VANTA_PRUNE_PROVIDER",
  code:     "VANTA_CODE_PROVIDER",
};

/**
 * Resolve an LLM provider for an auxiliary function. Checks for a function-specific
 * model override (e.g. VANTA_MODEL_VISION), optionally also a provider override
 * (VANTA_VISION_PROVIDER). Falls back to the base provider when neither is set.
 * Pure — no side effects, safe to call anywhere.
 */
export function resolveAuxProvider(
  fn: AuxFunction,
  env: NodeJS.ProcessEnv,
): LLMProvider {
  const modelKey    = AUX_ENV_VARS[fn];
  const providerKey = AUX_PROVIDER_ENV_VARS[fn];
  const modelOverride    = env[modelKey];
  const providerOverride = env[providerKey];

  if (!modelOverride && !providerOverride) return resolveProvider(env);

  const merged = { ...env };
  if (modelOverride)    merged.VANTA_MODEL    = modelOverride;
  if (providerOverride) merged.VANTA_PROVIDER = providerOverride;
  return resolveProvider(merged);
}

/**
 * Describe the active routing map for display (e.g. in /status or /model).
 * Only includes functions with overrides configured.
 */
export function describeAuxMap(env: NodeJS.ProcessEnv): string {
  const lines: string[] = [];
  for (const fn of Object.keys(AUX_ENV_VARS) as AuxFunction[]) {
    const model    = env[AUX_ENV_VARS[fn]];
    const provider = env[AUX_PROVIDER_ENV_VARS[fn]];
    if (model || provider) {
      lines.push(`  ${fn.padEnd(10)} → ${provider ? `${provider}/` : ""}${model ?? "(same provider)"}`);
    }
  }
  return lines.length
    ? `Aux model routing:\n${lines.join("\n")}`
    : "(no per-function model overrides configured — VANTA_MODEL_VISION etc.)";
}
