import type { Message } from "../types.js";
import { protectHeadTail } from "./compaction-boundary.js";
import { estimateTokens, type TrimOptions } from "../context.js";

// Default tail-token budget. 0 = the protected tail is exactly the protectLast
// count (preserves prior compaction behavior). Growing the tail to fill a token
// budget is opt-in via TrimOptions.tailTokenBudget — a flat default would
// over-protect small context windows and suppress compaction that should run.
const DEFAULT_TAIL_TOKEN_BUDGET = 0;

/** Token cost of one message, for budgeting a protected tail. */
function tokenOf(m: Message): number {
  return estimateTokens([m]);
}

export type SplitResult = {
  system: Message[];
  head: Message[];
  tail: Message[];
  middle: Message[];
};

/**
 * Pure helper: partition messages into system / head / tail / middle for
 * compaction. Returns null when under threshold or too short to compact.
 * Both compressMessages and compactConversation use this to avoid duplicating
 * the split logic (which was the source of their high cyclomatic complexity).
 */
export function splitForCompaction(
  messages: Message[],
  contextWindow: number,
  opts: TrimOptions,
): SplitResult | null {
  const protectFirst = opts.protectFirst ?? 3;
  const protectLast = opts.protectLast ?? 6;
  const threshold = (opts.thresholdPct ?? 75) / 100;

  if (estimateTokens(messages) <= contextWindow * threshold) return null;

  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  if (rest.length <= protectFirst + protectLast) return null;

  // Align the head/middle and middle/tail cuts so they never split a tool_call
  // from its tool_result (an orphaned pair 400s the provider). The tail is also
  // token-budgeted (HARNESS-COMPACT-BOUNDARY). The leading-tool-result guard is
  // now subsumed by alignBoundaryBackward inside protectHeadTail.
  const { headEnd, tailStart } = protectHeadTail(
    rest,
    { protectFirst, protectLast, tailTokenBudget: opts.tailTokenBudget ?? DEFAULT_TAIL_TOKEN_BUDGET },
    tokenOf,
  );
  const head = rest.slice(0, headEnd);
  const middle = rest.slice(headEnd, tailStart);
  const tail = rest.slice(tailStart);

  return { system, head, tail, middle };
}
