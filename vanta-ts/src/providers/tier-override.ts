// Tier-keyword → concrete model resolution. A tier keyword (opus|sonnet|haiku)
// used wherever model selection accepts a tier resolves to a specific pinned
// model id via env (VANTA_MODEL_OPUS / _SONNET / _HAIKU). Unset → the tier's
// catalogued default (current behavior, unchanged). Pure: env is passed in.

import { providerById } from "./catalog.js";

/** The three Claude capability tiers a keyword can name. */
export type Tier = "opus" | "sonnet" | "haiku";

const TIERS: readonly Tier[] = ["opus", "sonnet", "haiku"];

/** The env var that pins each tier to a concrete model id. */
const TIER_ENV: Record<Tier, string> = {
  opus: "VANTA_MODEL_OPUS",
  sonnet: "VANTA_MODEL_SONNET",
  haiku: "VANTA_MODEL_HAIKU",
};

/** True when `s` (case-insensitively) is one of the tier keywords. */
export function isTierKeyword(s: string): s is Tier {
  return (TIERS as readonly string[]).includes(s.trim().toLowerCase());
}

/**
 * The catalogued default model for a tier — the first Anthropic catalog model
 * id whose name carries that tier (`claude-<tier>-…`), in curated order. Derived
 * from PROVIDER_CATALOG so it tracks the catalog instead of a second hardcode.
 * Returns null if the catalog has no model for that tier.
 */
function catalogDefault(tier: Tier): string | null {
  const models = providerById("anthropic")?.models ?? [];
  return models.find((m) => m.startsWith(`claude-${tier}-`)) ?? null;
}

/**
 * Resolve a tier keyword to a concrete model id.
 *   env[VANTA_MODEL_<TIER>] set + non-empty → that pinned id (override wins)
 *   else                                    → the tier's catalogued default
 * `tier` is matched case-insensitively. A non-tier string returns null (callers
 * keep their existing literal-model behavior). Pure — no process.env read.
 */
export function resolveTierModel(tier: string, env: NodeJS.ProcessEnv): string | null {
  const key = tier.trim().toLowerCase();
  if (!isTierKeyword(key)) return null;
  const override = env[TIER_ENV[key]]?.trim();
  if (override) return override;
  return catalogDefault(key);
}
