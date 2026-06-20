import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";
import { parseStylesheet, resolveStyle, type ResolvedStyle } from "./stylesheet.js";
import { resolveEffortLevel } from "../effort.js";

/** Routing tier — picks a cheap or expensive model for a task. */
export type Tier = "cheap" | "expensive";

/**
 * Task class consumed by the model stylesheet. The binary tier maps onto two
 * named classes so the existing classifier seeds the selector lookup:
 *   expensive → "coding" (planning/synthesis/code work)
 *   cheap     → "trivial" (lookups/listing/status)
 * A stylesheet's universal `*` rule covers any class with no explicit rule, so
 * these two names are a starting taxonomy, not a closed set.
 */
export type TaskClass = "coding" | "trivial";

/** Map the binary tier onto a stylesheet task class. */
export function taskClassFor(tier: Tier): TaskClass {
  return tier === "expensive" ? "coding" : "trivial";
}

/**
 * Keywords that imply planning / synthesis / code / architecture / writing /
 * analysis — work that benefits from a stronger (expensive) model.
 */
const EXPENSIVE_KEYWORDS = [
  "plan",
  "design",
  "architect",
  "refactor",
  "implement",
  "write code",
  "debug",
  "analyze",
  "synthesize",
  "strategy",
  "review",
  "fix",
  "build",
];

/**
 * Keywords that imply clearly-trivial work (lookups, listing, status, fetch) —
 * safe to route to the cheap model.
 */
const CHEAP_KEYWORDS = ["lookup", "list", "status", "summarize", "fetch"];

/**
 * Classify a task into a routing tier from its instruction text. Pure.
 *
 * Three-way bias (case-insensitive substring match):
 *   1. Any expensive keyword present  → "expensive".
 *   2. Else any cheap keyword present → "cheap".
 *   3. Neither (ambiguous)            → "expensive".
 *
 * The ambiguous default leans expensive on purpose: overpaying for a stronger
 * model is cheaper than underthinking a task that needed one. Substring (not
 * word-boundary) matching is intentional — any over-trigger (e.g. "fix" inside
 * "prefix") errs toward expensive, which is the desired direction.
 */
export function classifyTask(instruction: string): Tier {
  const text = instruction.toLowerCase();
  if (EXPENSIVE_KEYWORDS.some((kw) => text.includes(kw))) return "expensive";
  if (CHEAP_KEYWORDS.some((kw) => text.includes(kw))) return "cheap";
  return "expensive";
}

/**
 * Try each entry of a resolved style's fallback chain in order, returning the
 * first provider that resolves without throwing. Each entry swaps VANTA_MODEL and
 * VANTA_EFFORT_LEVEL; the provider stays VANTA_PROVIDER. If every entry throws,
 * the last error is rethrown so the caller still sees a real provider failure.
 */
function resolveWithFallback(
  env: NodeJS.ProcessEnv,
  style: ResolvedStyle,
): LLMProvider {
  let lastError: unknown;
  for (const entry of style.fallback) {
    try {
      return resolveProvider({
        ...env,
        VANTA_MODEL: entry.model,
        VANTA_EFFORT_LEVEL: entry.effort,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("model stylesheet: no fallback entry resolved a provider");
}

/**
 * Resolve an LLM provider routed by task tier.
 *
 * When VANTA_MODEL_STYLESHEET is set, the instruction is classified into a task
 * class and routed through the selector-based stylesheet (per-class model +
 * effort with an automatic fallback chain — each entry is tried in order until a
 * provider resolves). A malformed stylesheet or an unmatched class degrades to
 * the legacy path below, so a bad config never breaks routing.
 *
 * Legacy path (stylesheet unset or non-resolving): classify, then apply a
 * tier-specific model override if configured:
 *   cheap     → VANTA_MODEL_CHEAP
 *   expensive → VANTA_MODEL_EXPENSIVE
 * The override only swaps VANTA_MODEL; the provider stays VANTA_PROVIDER. When the
 * relevant override is absent, routing is a no-op — resolveProvider(env) runs
 * unchanged. With both unset, behavior is byte-identical to the pre-stylesheet
 * router, so an unconfigured deployment never changes.
 */
export function resolveRoutedProvider(
  env: NodeJS.ProcessEnv,
  instruction: string,
): LLMProvider {
  const tier = classifyTask(instruction);
  const sheet = env.VANTA_MODEL_STYLESHEET;
  if (sheet) {
    const parsed = parseStylesheet(sheet);
    if (parsed.ok) {
      const style = resolveStyle(
        parsed.stylesheet,
        taskClassFor(tier),
        resolveEffortLevel(env.VANTA_EFFORT_LEVEL),
      );
      if (style) return resolveWithFallback(env, style);
    }
    // Malformed or non-resolving stylesheet → fall through to the legacy path.
  }
  const override =
    tier === "cheap" ? env.VANTA_MODEL_CHEAP : env.VANTA_MODEL_EXPENSIVE;
  if (!override) return resolveProvider(env);
  return resolveProvider({ ...env, VANTA_MODEL: override });
}
