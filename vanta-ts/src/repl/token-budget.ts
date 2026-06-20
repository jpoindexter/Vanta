// TOKEN-BUDGET-PARSE — read a per-turn token budget directive out of a user
// message: `+500k`, `use 2M tokens`, `budget 1000000 tokens`, `1.5m tokens`.
// Pure, synchronous, deterministic — same heuristic-bank shape as clarity-gate /
// mode-detect (zero I/O, zero LLM). A message with no directive yields null, so
// the turn keeps its existing (unbudgeted) behavior. Intended pre-turn consumer:
// interactive-turn.ts (where the sent message is already read for mode-detect /
// clarity-gate) — wired in a follow-up; this round ships the pure parser only.

// Multiplier suffixes — k = thousand, m = million. Case-insensitive.
const MULTIPLIER: Record<string, number> = { k: 1e3, m: 1e6 };

// A number (decimals ok) immediately followed by a k/m suffix: `+500k`, `2M`,
// `1.5m`. The suffix is what marks it as a token budget, so a bare `500` or
// `$500` never matches here. Captures [number, suffix].
const SUFFIXED = /(\d+(?:\.\d+)?)\s*([km])\b/i;

// A number (optionally k/m-suffixed) that is explicitly qualified by the word
// "token(s)": `1000000 tokens`, `1.5m tokens`, `use 2 m tokens`. The word
// "token" is what marks it, so `500 dollars` never matches. Captures
// [number, optional-suffix].
const TOKEN_QUALIFIED = /(\d+(?:\.\d+)?)\s*([km])?\s*tokens?\b/i;

/** Resolve a captured [number, suffix?] pair to an integer token count. Pure. */
function toTokens(numeric: string | undefined, suffix: string | undefined): number {
  const base = parseFloat(numeric ?? "");
  if (Number.isNaN(base)) return 0;
  const factor = suffix ? MULTIPLIER[suffix.toLowerCase()] ?? 1 : 1;
  return Math.round(base * factor);
}

/**
 * Parse a token-budget directive from a user message into a numeric budget.
 * Matches `+500k`, `use 2M tokens`, `budget 1000000 tokens`, `1.5m tokens`
 * (k=1e3, m=1e6, case-insensitive, decimals ok, whitespace-tolerant). A bare
 * number (`run 5 tests`, `500`) or a currency amount (`$500`, `500 dollars`)
 * is NOT a budget. Returns null when no directive is present. Pure.
 */
export function parseTokenBudget(text: string): number | null {
  if (typeof text !== "string" || text.trim() === "") return null;

  // A "token(s)"-qualified amount is the most explicit signal — prefer it so
  // `budget 1000000 tokens` reads the full number, not a stray k/m elsewhere.
  const qualified = TOKEN_QUALIFIED.exec(text);
  if (qualified) {
    const tokens = toTokens(qualified[1], qualified[2]);
    return tokens > 0 ? tokens : null;
  }

  // Otherwise a k/m-suffixed number is a budget (`+500k`, `2M`) — but a
  // currency-suffixed amount (`$500k`? no — `$500`) stays out: a `$` directly
  // before the number disqualifies it as a token budget.
  const suffixed = SUFFIXED.exec(text);
  if (suffixed && !isCurrencyAt(text, suffixed.index)) {
    const tokens = toTokens(suffixed[1], suffixed[2]);
    return tokens > 0 ? tokens : null;
  }

  return null;
}

/** True when a `$` immediately precedes the number at `index` (currency, not tokens). Pure. */
function isCurrencyAt(text: string, index: number): boolean {
  return index > 0 && text[index - 1] === "$";
}
