// VANTA-PRIVACY-LEVELS — pure privacy-level resolver + outbound-traffic classifier.
//
// Vanta is local-first/private: the DEFAULT level is current behavior (every
// outbound category allowed). Higher levels conservatively reduce network reach.
// This module is pure — it decides POLICY only. Wiring `isAllowed` into the
// actual network call sites is a separate, careful pass (see PRIVACY_CALL_SITES).

/** Outbound-traffic privacy posture. `default` = today's behavior (all allowed). */
export type PrivacyLevel = "default" | "no-telemetry" | "essential";

/** Category of an outbound network call, used to classify it against a level. */
export type TrafficCategory =
  | "provider" // LLM provider API (the agent can't function without it)
  | "kernel" // local kernel sidecar (127.0.0.1) the agent needs to function
  | "telemetry" // analytics / usage reporting (Vanta ships none today)
  | "search" // web-search providers
  | "fetch" // web_fetch / browser fetches
  | "update" // version / update checks
  | "other"; // any other outbound call

const PRIVACY_LEVELS: readonly PrivacyLevel[] = ["default", "no-telemetry", "essential"];

/** Categories the agent strictly needs to function (allowed at every level). */
const ESSENTIAL_CATEGORIES: ReadonlySet<TrafficCategory> = new Set<TrafficCategory>([
  "provider",
  "kernel",
]);

/** Settings shape this resolver reads (a subset of the full Settings type). */
export interface PrivacySettings {
  privacyLevel?: PrivacyLevel;
}

const ENV_KEY = "VANTA_PRIVACY";

/** True when `value` is one of the known privacy levels. Pure narrowing guard. */
function isPrivacyLevel(value: unknown): value is PrivacyLevel {
  return typeof value === "string" && (PRIVACY_LEVELS as readonly string[]).includes(value);
}

/**
 * Resolve the active privacy level. Precedence: env `VANTA_PRIVACY` >
 * `settings.privacyLevel` > `"default"`. Unknown/invalid values are ignored
 * (fall through to the next source), so bad config never silently weakens or
 * strengthens the posture in an unexpected way.
 */
export function resolvePrivacyLevel(
  settings: PrivacySettings | undefined,
  env: NodeJS.ProcessEnv,
): PrivacyLevel {
  const fromEnv = env[ENV_KEY];
  if (isPrivacyLevel(fromEnv)) return fromEnv;
  if (isPrivacyLevel(settings?.privacyLevel)) return settings.privacyLevel;
  return "default";
}

/**
 * Is an outbound call of `category` permitted at `level`? Pure.
 *
 * - `default`      → all categories allowed (current behavior).
 * - `no-telemetry` → everything except `telemetry`.
 * - `essential`    → only the categories the agent needs to function
 *                    (`provider` + `kernel`); search/fetch/update/other blocked.
 */
export function isAllowed(category: TrafficCategory, level: PrivacyLevel): boolean {
  switch (level) {
    case "default":
      return true;
    case "no-telemetry":
      return category !== "telemetry";
    case "essential":
      return ESSENTIAL_CATEGORIES.has(category);
  }
}

/**
 * Network call sites that SHOULD consult `isAllowed` in the wiring follow-up.
 * Named here (not yet wired) so the gate is discoverable; gating every path is
 * a larger careful pass per the card's deliver-pure-then-wire approach.
 */
export const PRIVACY_CALL_SITES: Readonly<Record<TrafficCategory, readonly string[]>> = {
  provider: ["providers/openai.ts", "providers/anthropic.ts", "providers/codex.ts"],
  kernel: ["safety-client.ts", "kernel-launcher.ts"],
  telemetry: ["(none shipped — reserved for any future usage reporting)"],
  search: [
    "search/duckduckgo.ts",
    "search/searxng.ts",
    "search/serpapi.ts",
    "search/brave.ts",
    "search/bing.ts",
    "search/jina.ts",
    "search/embed.ts",
  ],
  fetch: ["tools/web-fetch.ts", "tools/browser-navigate.ts", "tools/browser-act.ts"],
  update: ["update/version-check.ts"],
  other: ["google/client.ts", "gateway/platforms/telegram.ts", "mcp/client.ts"],
};
