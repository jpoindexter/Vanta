import { providerById } from "../providers/catalog.js";

// VANTA-TEAMMATE-DEFAULT-MODEL — pure model resolution for swarm/teammate
// sub-agents.
//
// Spawned teammates (the `team run` executor, swarm/fleet workers) inherit the
// parent's active model by default. `VANTA_TEAMMATE_MODEL` lets an operator pin
// a STRONGER model for those workers without touching the parent's own model.
//
// Resolution (pure, no I/O):
//   1. unset / blank  → return `activeModel` unchanged (current behavior — a
//      teammate inherits the parent/active model byte-identically).
//   2. "auto" sentinel → the active provider's strongest catalogued model
//      (provider-aware). An unknown provider, or a provider with no catalog
//      entry, falls back SAFELY to `activeModel`.
//   3. any other value → use it verbatim (an explicit operator override; the
//      model picker accepts free-typed ids, so an off-catalog id is honored).
//
// Never returns empty: a blank override degrades to the inherited active model.

/** The opt-in sentinel that asks for the active provider's strongest model. */
const AUTO = "auto";

/**
 * The strongest catalogued model per provider — the "capable default" a
 * teammate gets under `VANTA_TEAMMATE_MODEL=auto`. Keyed by provider id; the
 * value MUST appear in that provider's catalog `models` list (verified in the
 * test). A provider absent here falls back to the active model, so adding a new
 * provider never breaks teammate resolution — it just inherits until tuned.
 */
const STRONG_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-5.6-sol",
  anthropic: "claude-opus-4-8",
  "claude-code": "claude-opus-4-8",
  gemini: "gemini-2.5-pro",
  openrouter: "anthropic/claude-opus-4.1",
  codex: "gpt-5.6-sol",
  ollama: "llama3.3",
};

/** Read the active provider id the same way `resolveProvider` does. */
function activeProviderId(env: NodeJS.ProcessEnv): string {
  return (env.VANTA_PROVIDER ?? "openai").toLowerCase();
}

/**
 * The active provider's strongest model, or `undefined` when the provider has
 * no curated strong model OR that model isn't in the provider's catalog (so a
 * stale entry can never resolve to an id the provider can't serve). Pure.
 */
function strongModelFor(providerId: string): string | undefined {
  const candidate = STRONG_MODEL_BY_PROVIDER[providerId];
  if (!candidate) return undefined;
  const entry = providerById(providerId);
  // Provider-aware safety: only return the strong model if the catalog confirms
  // the provider actually lists it. An unknown provider has no entry → undefined.
  if (entry && !entry.models.includes(candidate)) return undefined;
  return candidate;
}

/**
 * Resolve the model id a swarm/teammate worker should run on. Pure.
 *
 * @param env          the process env (read-only; only `VANTA_TEAMMATE_MODEL`
 *                     and `VANTA_PROVIDER` are consulted).
 * @param activeModel  the parent/active model id — the inherit default.
 * @returns            the teammate's model id; always non-empty.
 */
export function resolveTeammateModel(
  env: NodeJS.ProcessEnv,
  activeModel: string,
): string {
  const override = (env.VANTA_TEAMMATE_MODEL ?? "").trim();
  if (!override) return activeModel; // unset/blank → inherit (current behavior)
  if (override.toLowerCase() === AUTO) {
    return strongModelFor(activeProviderId(env)) ?? activeModel;
  }
  return override; // explicit operator override (free-typed ids allowed)
}

/**
 * The env a teammate worker should resolve its provider from: the parent env
 * with `VANTA_MODEL` set to the resolved teammate model. When the resolution is
 * a no-op (unset override → inherited active model), the returned env is
 * byte-identical in effect to the parent (same `VANTA_MODEL`). Pure.
 */
export function teammateEnv(
  env: NodeJS.ProcessEnv,
  activeModel: string,
): NodeJS.ProcessEnv {
  return { ...env, VANTA_MODEL: resolveTeammateModel(env, activeModel) };
}
