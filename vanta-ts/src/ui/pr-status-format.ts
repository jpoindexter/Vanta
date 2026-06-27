// VANTA-PR-STATUS-POLL — the display layer: a parsed PrStatus → a compact,
// untrusted-text-safe status line. Sibling to pr-status.ts (the parse + poll
// layer); kept separate so the rendering vocabulary (glyphs, labels, segment
// ordering) lives in one place. The title is never rendered inline here (kept
// off the one-line status to stay compact + because it's untrusted text).

import type { PrChecks, PrStatus } from "./pr-status.js";

// Compact glyph + label per review decision. Unknown/absent → a neutral
// "review pending" (gh leaves reviewDecision empty until a review is requested).
const REVIEW_LABEL: Record<string, string> = {
  APPROVED: "✓ approved",
  CHANGES_REQUESTED: "✗ changes requested",
  REVIEW_REQUIRED: "⧗ review required",
};

function reviewPart(decision: string | undefined): string {
  return REVIEW_LABEL[decision ?? ""] ?? "⧗ review pending";
}

/** "4✓/1✗/2⧗" — only the non-zero buckets, in pass/fail/pending order. Empty
 *  string when there are no checks at all (so the caller can drop the segment). */
function checksPart(checks: PrChecks): string {
  const parts: string[] = [];
  if (checks.passing) parts.push(`${checks.passing}✓`);
  if (checks.failing) parts.push(`${checks.failing}✗`);
  if (checks.pending) parts.push(`${checks.pending}⧗`);
  return parts.join("/");
}

// gh's mergeable → a compact word. UNKNOWN (gh still computing) → nothing.
const MERGEABLE_LABEL: Record<string, string> = {
  MERGEABLE: "mergeable",
  CONFLICTING: "conflicts",
};

/**
 * The compact status line:
 *   "PR #12 ✓ approved · checks 4✓/1✗ · mergeable"
 *   "PR #5 ⧗ review pending · checks 5✓"
 * Review decision always shows (it's the headline); the checks + mergeable
 * segments are added only when present. The title is never rendered inline
 * (kept off the one-line status to stay compact + because it's untrusted); it
 * lives on PrStatus for a caller that wants a control-stripped header.
 */
export function formatPrStatusLine(status: PrStatus): string {
  const segments: string[] = [`PR #${status.number} ${reviewPart(status.reviewDecision)}`];
  const checks = checksPart(status.checks);
  if (checks) segments.push(`checks ${checks}`);
  const mergeable = MERGEABLE_LABEL[status.mergeable ?? ""];
  if (mergeable) segments.push(mergeable);
  return segments.join(" · ");
}
