// VANTA-CONTEXT-UPGRADE — when the conversation's token usage approaches the
// active model's context window, surface a ONE-LINE non-blocking suggestion to
// switch to an extended-context (e.g. 1M-token) variant of the same family. The
// threshold check + suggestion text are PURE so they're fully unit-testable;
// below the threshold (or already on an extended-context model) = no suggestion,
// no behavior change. Mirrors complexity-gate / compaction-remind: a pure
// predicate + a pure note string the host console.logs.

/** Default fill ratio [0..1) at which the upgrade suggestion fires. */
export const DEFAULT_CONTEXT_UPGRADE_THRESHOLD = 0.85;

/**
 * Markers that mean a model is ALREADY an extended-context variant — suggesting
 * an upgrade would be noise. Matched case-insensitively against the model id:
 *  - "1m"/"2m": the explicit large-window suffix (e.g. `claude-opus-4-8[1m]`).
 *  - the Gemini long-context families, which ship 1M+ windows natively.
 */
const EXTENDED_MARKERS = ["1m", "2m", "gemini-1.5-pro", "gemini-2.5-pro", "gemini-2.0-pro"];

/** True when the model id already denotes an extended-context variant. Pure. */
export function isExtendedContextModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return EXTENDED_MARKERS.some((m) => id.includes(m));
}

/** Resolve the fire threshold, honoring VANTA_CONTEXT_UPGRADE_THRESHOLD. Pure.
 *  A value of 0 (or any non-finite / out-of-range value other than a valid
 *  fraction) disables the gate by yielding 0 — callers treat threshold 0 as off. */
export function resolveContextUpgradeThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VANTA_CONTEXT_UPGRADE_THRESHOLD);
  if (env.VANTA_CONTEXT_UPGRADE_THRESHOLD === undefined || env.VANTA_CONTEXT_UPGRADE_THRESHOLD === "") {
    return DEFAULT_CONTEXT_UPGRADE_THRESHOLD;
  }
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return DEFAULT_CONTEXT_UPGRADE_THRESHOLD;
  return raw; // 0 = explicitly disabled
}

/**
 * True when usage is at/above the threshold AND the current model is NOT already
 * an extended-context one. Pure. Disabled (returns false) when threshold is 0,
 * the window is non-positive, or usage is non-positive — so below-threshold and
 * misconfigured inputs are byte-identical "no suggestion".
 */
export function shouldSuggestContextUpgrade(
  usedTokens: number,
  contextWindow: number,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const threshold = resolveContextUpgradeThreshold(env);
  if (threshold <= 0) return false;
  if (contextWindow <= 0 || usedTokens <= 0) return false;
  if (isExtendedContextModel(modelId)) return false;
  return usedTokens / contextWindow >= threshold;
}

/**
 * The one-line suggestion, naming a concrete extended-context option for the
 * active model's family. Pure. Falls back to a generic 1M-context phrasing for
 * families without a known named variant.
 */
export function buildContextUpgradeNote(modelId: string): string {
  const suggestion = extendedVariantFor(modelId);
  return `↑ context nearly full — consider switching to an extended-context model (e.g. ${suggestion}) via /model to avoid truncation.`;
}

/** Name a likely extended-context variant for the model's family. Pure. */
function extendedVariantFor(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith("claude")) return `${modelId}[1m] (1M-token Claude)`;
  if (id.startsWith("gemini")) return "gemini-2.5-pro (1M-token Gemini)";
  if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4")) {
    return "a 1M-context GPT variant";
  }
  return "a 1M-token-context model";
}
