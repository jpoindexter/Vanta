// VANTA-BUDGET-CAP — a hard per-session spend cap that HALTS the agent loop.
//
// Distinct from the scoped loop/goal budgets in this folder (PCLIP-BUDGET-HARDSTOP):
// those auto-pause a named scope and cancel its queued work; this is a single,
// session-wide ceiling on accumulated LLM spend that stops the interactive loop
// cleanly once the running total reaches the limit. Unset = no cap (unchanged).
//
// All three helpers are pure so the wiring stays a thin "accumulate → compare →
// stop" check at the one place per-turn cost is folded into the session total.

import { formatUsd } from "../pricing.js";

const ENV_KEY = "VANTA_MAX_BUDGET_USD";

/**
 * Resolve the session spend cap in USD. Precedence: explicit flag > env var.
 * Returns null (no cap) when neither is set or the value is not a positive,
 * finite number — a malformed cap must never silently halt the loop.
 */
export function resolveSessionCap(env: NodeJS.ProcessEnv, flag?: string | number): number | null {
  const fromFlag = parsePositive(flag);
  if (fromFlag !== null) return fromFlag;
  return parsePositive(env[ENV_KEY]);
}

/** A spend total is over the cap once it reaches the limit. No cap (null) is never over. Pure. */
export function isOverCap(spentUsd: number, cap: number | null): boolean {
  if (cap === null) return false;
  return spentUsd >= cap;
}

/** The halt message shown before the loop stops: current spend vs the cap. Pure. */
export function buildCapExceededMessage(spentUsd: number, cap: number): string {
  return `Budget cap reached: spent ${formatUsd(spentUsd)} of the ${formatUsd(cap)} session cap. Stopping. Raise or clear --max-budget-usd (or ${ENV_KEY}) to continue.`;
}

/** Parse a positive finite number from a flag/env value, else null. */
function parsePositive(value: string | number | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
