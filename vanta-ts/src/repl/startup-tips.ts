/**
 * OP-STARTUP-TIPS — one short feature-discovery tip at REPL start.
 *
 * Pure + deterministic: the pick comes from an injected integer seed (e.g. a
 * session counter or day-of-year), NOT Math.random — so it's stable within a
 * session and unit-testable. Every tip references a REAL shipped Vanta feature
 * (a slash command verified in repl/catalog.ts, or a documented VANTA_ env var).
 *
 * Wiring (NOT done this round, named for clarity-gate): interactive.ts
 * `renderBanner` (the joined line array it returns, ~line 48) — or the UI
 * banner — would append `formatStartupTip(sessionSeed, env)` as its last line
 * when non-empty, where `sessionSeed` is e.g. a session counter or the
 * day-of-year so the tip rotates per session but stays stable within one.
 */

/** Env var that disables tips when set to a falsy token. Default: ON. */
export const TIPS_ENV_VAR = "VANTA_TIPS";

const DISABLED_VALUES: ReadonlySet<string> = new Set(["0", "false", "off", "no"]);

/**
 * Feature-discovery tips. Each ≤ ~80 chars, prefixed "💡 Tip: ", and cites a
 * real `/command` (cross-checked against SLASH_COMMANDS) or a real VANTA_ env
 * var (cross-checked against vanta-ts/CLAUDE.md / root CLAUDE.md docs).
 */
export const STARTUP_TIPS: readonly string[] = [
  "💡 Tip: /handoff writes a context packet for a clean restart elsewhere.",
  "💡 Tip: /verify runs the app and confirms a change actually works.",
  "💡 Tip: /skeptic <claim> adversarially refutes a claim before you trust it.",
  "💡 Tip: /next surfaces one concrete micro-step from your active goals.",
  "💡 Tip: /where shows your last stated intent plus recent tool calls.",
  "💡 Tip: /reach doctors every internet channel and the exact fix per gap.",
  "💡 Tip: /skillify distills this session into a draft SKILL.md.",
  "💡 Tip: /recover classifies trouble: bug, polluted context, or bad assumption.",
  "💡 Tip: /boundary archives the current task state and starts fresh.",
  "💡 Tip: /auto does the least that works — stdlib over deps, delete over add.",
  "💡 Tip: /deep-research fans out multi-source search with cited synthesis.",
  "💡 Tip: VANTA_VERIFY=1 runs a post-turn completion verifier on 'done' claims.",
  "💡 Tip: VANTA_PROACTIVE=1 lets Vanta advance queued work while you're away.",
  "💡 Tip: VANTA_TUI=v2 opens the opt-in mission-control shell.",
];

/**
 * Deterministic pick: `STARTUP_TIPS[seed % length]`. Handles seed 0 (→ first),
 * large seeds (wrap), and negative seeds (clamp via abs → never crash/empty).
 */
export function pickStartupTip(seed: number): string {
  const len = STARTUP_TIPS.length;
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  // safeSeed % len is always a valid index (len > 0), so this is never undefined.
  return STARTUP_TIPS[safeSeed % len]!;
}

/**
 * Tips default ON. Disabled only when VANTA_TIPS is an explicit falsy token
 * (0/false/off/no). Default-on chosen for discovery: the cost is one banner
 * line; an operator who knows the features opts out with VANTA_TIPS=0.
 */
export function startupTipsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[TIPS_ENV_VAR];
  if (raw === undefined) return true;
  return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

/** The picked tip when enabled, else "" (no tip). */
export function formatStartupTip(seed: number, env: NodeJS.ProcessEnv = process.env): string {
  return startupTipsEnabled(env) ? pickStartupTip(seed) : "";
}
