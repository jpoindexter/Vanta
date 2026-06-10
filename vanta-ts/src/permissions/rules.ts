/**
 * CC-PERMISSIONS — pure rule layer on top of the Rust kernel verdict.
 *
 * The load-bearing invariant: rules may TIGHTEN, never LOOSEN. The kernel's
 * `assess()` verdict is the floor — a user rule can escalate (allow→ask→block)
 * but can NEVER turn a kernel `block` into anything weaker. `tighten()` is the
 * whole safety story; it is exhaustively unit-tested over the verdict × action
 * matrix. See docs/design-cc-permissions.md.
 */

export type PermAction = "allow" | "ask" | "deny";

export type PermRule = {
  action: PermAction;
  /** Exact tool name to match. Optional — omit to match any tool. */
  tool?: string;
  /** Substring matched against the safety descriptor. Optional — omit to match any. */
  pattern?: string;
};

/**
 * First-match-by-specificity: a rule scores tool(2) + pattern(1), so a
 * tool+pattern rule (3) beats tool-only (2) beats pattern-only (1) beats a
 * bare match-all rule (0). The highest-scoring matching rule wins regardless of
 * declaration order, so a broad rule declared first can't shadow a specific
 * rule declared later. Ties keep the earliest (`>`, not `>=`). Returns the
 * winning rule's action, or `null` when nothing matches.
 */
export function matchRule(
  rules: PermRule[],
  toolName: string,
  descriptor: string,
): PermAction | null {
  let best: PermRule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (rule.tool !== undefined && rule.tool !== toolName) continue;
    if (rule.pattern !== undefined && !descriptor.includes(rule.pattern)) continue;
    const score = (rule.tool !== undefined ? 2 : 0) + (rule.pattern !== undefined ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best ? best.action : null;
}

/**
 * THE security core. Combine the kernel verdict with a matched user rule.
 *
 * Invariant — kernel `block` is immovable: it is the FIRST statement, so no
 * rule branch can ever run for a blocked action. `deny` is the only action that
 * crosses vocabularies (PermAction `deny` → verdict `block`). `allow`/`ask`/null
 * can only keep or escalate, never loosen below the verdict.
 */
export function tighten(
  kernelVerdict: "allow" | "ask" | "block",
  ruleAction: PermAction | null,
): "allow" | "ask" | "block" {
  if (kernelVerdict === "block") return "block"; // immovable — no rule may loosen
  if (ruleAction === "deny") return "block"; // escalate to block
  if (ruleAction === "ask") return "ask"; // escalate allow→ask, keep ask→ask
  if (ruleAction === "allow") return "allow"; // auto-confirm ask→allow, no-op on allow
  return kernelVerdict; // null: ask→ask, allow→allow (no matching rule)
}
