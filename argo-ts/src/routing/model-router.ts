import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";

/** Routing tier — picks a cheap or expensive model for a task. */
export type Tier = "cheap" | "expensive";

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
 * Resolve an LLM provider routed by task tier. Classifies the instruction, then
 * applies a tier-specific model override if one is configured:
 *   cheap     → ARGO_MODEL_CHEAP
 *   expensive → ARGO_MODEL_EXPENSIVE
 * The override only swaps ARGO_MODEL; the provider stays ARGO_PROVIDER. When the
 * relevant override is absent, routing is a no-op — resolveProvider(env) runs
 * unchanged, so an unconfigured deployment never breaks the default.
 */
export function resolveRoutedProvider(
  env: NodeJS.ProcessEnv,
  instruction: string,
): LLMProvider {
  const tier = classifyTask(instruction);
  const override =
    tier === "cheap" ? env.ARGO_MODEL_CHEAP : env.ARGO_MODEL_EXPENSIVE;
  if (!override) return resolveProvider(env);
  return resolveProvider({ ...env, ARGO_MODEL: override });
}
