import type { Message } from "../types.js";

// HARNESS-COMPACT-BOUNDARY — pure helpers that keep message compaction from
// splitting a tool_call from its tool_result (an orphaned pair 400s the
// provider) and from thrashing (re-compacting for trivial savings).
//
// The pairing rule mirrors sanitize.ts: an assistant message with `toolCalls`
// owns one `tool` message per call id; a `tool` message belongs to the nearest
// preceding assistant that issued its `toolCallId`. A cut index splits a pair
// when the call and its result land on opposite sides of it.

/** True when this message is an assistant turn that issued one or more tool calls. */
function hasToolCalls(m: Message | undefined): boolean {
  return m?.role === "assistant" && (m.toolCalls?.length ?? 0) > 0;
}

/** The tool_call ids issued by an assistant message (empty for any other role). */
function callIdsOf(m: Message | undefined): string[] {
  return m?.role === "assistant" ? (m.toolCalls ?? []).map((tc) => tc.id) : [];
}

/**
 * Does the cut at `index` (messages[0..index) on one side, [index..) on the
 * other) split a tool pair? A split happens when an assistant tool_call sits
 * just before the cut while one of its results sits at/after it, OR a tool
 * result sits at the cut while its issuing assistant sits before it.
 */
export function splitsToolPair(messages: Message[], index: number): boolean {
  if (index <= 0 || index >= messages.length) return false;
  const before = messages[index - 1];
  const at = messages[index];
  // A tool result can only be the first message on the far side if its call is
  // on the near side — that orphans the result.
  if (at?.role === "tool") return true;
  // An assistant tool_call as the last message on the near side orphans the
  // call: its results are the `tool` messages that follow, now on the far side.
  if (hasToolCalls(before)) {
    const ids = new Set(callIdsOf(before));
    // Confirm at least one matching result actually follows (defensive: a
    // dangling call with no result anywhere is sanitize.ts's job, not a split).
    for (let i = index; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role === "tool" && ids.has(m.toolCallId)) return true;
    }
  }
  return false;
}

/**
 * Move a cut index LATER (toward the tail) until it no longer splits a tool
 * pair — used for the head/middle boundary so a protected head keeps the
 * results of any tool_call it includes. Bounded by `max` (never past it).
 */
export function alignBoundaryForward(messages: Message[], index: number, max: number): number {
  let i = Math.max(0, index);
  const ceiling = Math.min(max, messages.length);
  while (i < ceiling && splitsToolPair(messages, i)) i++;
  return i;
}

/**
 * Move a cut index EARLIER (toward the head) until it no longer splits a tool
 * pair — used for the middle/tail boundary so a protected tail never begins on
 * an orphaned result. Bounded by `min` (never before it).
 */
export function alignBoundaryBackward(messages: Message[], index: number, min: number): number {
  let i = Math.min(messages.length, index);
  const floor = Math.max(0, min);
  while (i > floor && splitsToolPair(messages, i)) i--;
  return i;
}

export type HeadTailBoundaries = { headEnd: number; tailStart: number };

/**
 * Compute non-tool-pair-splitting head/tail boundaries over `messages`:
 *  - head = [0, headEnd)   — the first `protectFirst` messages, extended
 *    forward so it never ends on an unresolved tool_call.
 *  - tail = [tailStart, n) — the last `protectLast`-ish messages by count and a
 *    token budget, pulled back so it never starts on an orphaned tool_result.
 * `tokenOf` measures one message (injected so this stays pure + provider-free).
 * The head and tail never overlap; the middle is whatever's between them.
 */
export function protectHeadTail(
  messages: Message[],
  bounds: { protectFirst: number; protectLast: number; tailTokenBudget: number },
  tokenOf: (m: Message) => number,
): HeadTailBoundaries {
  const n = messages.length;
  const headEnd = alignBoundaryForward(messages, Math.min(bounds.protectFirst, n), n);

  // Grow the tail backward by count first, then by token budget, never past head.
  let tailStart = Math.max(headEnd, n - Math.max(0, bounds.protectLast));
  let budget = bounds.tailTokenBudget;
  while (tailStart > headEnd) {
    const candidate = messages[tailStart - 1];
    if (!candidate) break;
    budget -= tokenOf(candidate);
    if (budget < 0) break;
    tailStart--;
  }
  tailStart = alignBoundaryBackward(messages, tailStart, headEnd);
  return { headEnd, tailStart };
}

/** A single compaction pass's savings as a fraction of the pre-pass size (0..1). */
export function passSavings(beforeTokens: number, afterTokens: number): number {
  if (beforeTokens <= 0) return 0;
  return Math.max(0, (beforeTokens - afterTokens) / beforeTokens);
}

export type ThrashCheck = {
  /** Savings (0..1) of each of the most recent passes, newest last. */
  recentSavings: readonly number[];
  /** Skip a pass when the last `window` passes each saved below this floor. */
  minSavings?: number;
  /** How many trailing passes must all be low-savings to skip. Default 2. */
  window?: number;
};

const DEFAULT_MIN_SAVINGS = 0.1; // 10%
const DEFAULT_WINDOW = 2;

/**
 * Anti-thrash gate: returns false (skip the pass) when the last `window`
 * compaction passes each saved less than `minSavings` — re-compacting for
 * sub-10% gains churns the transcript without buying meaningful headroom.
 * Returns true (proceed) when there's not yet a full low-savings window.
 */
export function shouldCompact(check: ThrashCheck): boolean {
  const minSavings = check.minSavings ?? DEFAULT_MIN_SAVINGS;
  const window = Math.max(1, check.window ?? DEFAULT_WINDOW);
  const recent = check.recentSavings.slice(-window);
  if (recent.length < window) return true;
  return !recent.every((s) => s < minSavings);
}
