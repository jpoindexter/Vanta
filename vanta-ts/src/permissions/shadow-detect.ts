/**
 * VANTA-SHADOWED-RULE-DETECT — flag permission rules that can never fire.
 *
 * A permission rule is *shadowed* (unreachable) when an EARLIER rule already
 * governs every target it could match — so for an operator reading the list,
 * the later rule is dead weight or, worse, a mistaken belief that it changes
 * behavior. The classic case is a narrow rule placed after a broad one of the
 * OPPOSITE decision: `deny shell_cmd *` then `allow shell_cmd git status` — the
 * earlier blanket already covers `git status`, so the allow never takes effect
 * and the operator's intent silently fails.
 *
 * Coverage model (the whole logic): an earlier rule E shadows a later rule R
 * when E matches every target R matches —
 *   - tool:    E.tool is undefined (any tool) OR E.tool === R.tool.
 *   - pattern: E.pattern is undefined (any descriptor) OR R.pattern is defined
 *              and CONTAINS E.pattern as a substring (every descriptor that
 *              satisfies R's pattern therefore also satisfies E's, so E's match
 *              set is equal-or-broader on that axis).
 * Both axes must hold. Exact duplicates are the trivial case (E covers R on
 * both axes by equality) and are flagged too. The detector is pure and
 * order-sensitive: only earlier rules can shadow later ones.
 */

import type { PermRule } from "./rules.js";

/** One shadowed rule and the earlier rule that makes it unreachable. */
export type ShadowedRule = {
  /** The unreachable rule. */
  rule: PermRule;
  /** 0-based index of `rule` in the input list. */
  index: number;
  /** The earlier rule whose match set covers `rule`'s. */
  shadowedBy: PermRule;
  /** 0-based index of `shadowedBy` in the input list. */
  shadowedByIndex: number;
};

/** True when `earlier`'s tool axis covers `later`'s (any-tool, or same tool). */
function toolCovers(earlier: PermRule, later: PermRule): boolean {
  return earlier.tool === undefined || earlier.tool === later.tool;
}

/**
 * True when `earlier`'s pattern axis covers `later`'s: any-pattern always
 * covers; otherwise `later` must have a pattern that contains `earlier`'s as a
 * substring (so every descriptor matching `later` also matches `earlier`).
 */
function patternCovers(earlier: PermRule, later: PermRule): boolean {
  if (earlier.pattern === undefined) return true;
  if (later.pattern === undefined) return false;
  return later.pattern.includes(earlier.pattern);
}

/** True when `earlier` matches every target `later` matches (both axes). */
function covers(earlier: PermRule, later: PermRule): boolean {
  return toolCovers(earlier, later) && patternCovers(earlier, later);
}

/**
 * Find rules that can never fire because an earlier rule already matches every
 * target they would. Returns one entry per shadowed rule, naming the FIRST
 * earlier rule that covers it. Pure; no shadowed rules → empty array.
 */
export function findShadowedRules(rules: PermRule[]): ShadowedRule[] {
  const shadowed: ShadowedRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const later = rules[i];
    if (later === undefined) continue;
    for (let j = 0; j < i; j++) {
      const earlier = rules[j];
      if (earlier === undefined) continue;
      if (covers(earlier, later)) {
        shadowed.push({ rule: later, index: i, shadowedBy: earlier, shadowedByIndex: j });
        break;
      }
    }
  }
  return shadowed;
}

/** Compact `action tool pattern` label (omitted fields become `*`). Pure. */
function ruleLabel(rule: PermRule): string {
  return `${rule.action} ${rule.tool ?? "*"} ${rule.pattern ?? "*"}`;
}

/**
 * One-line-per-rule human warning for shadowed rules. Returns "" when there are
 * none (silent — no shadowed rules, no output).
 */
export function buildShadowWarning(shadowed: ShadowedRule[]): string {
  if (shadowed.length === 0) return "";
  const header = `⚠ ${shadowed.length} unreachable permission rule${shadowed.length === 1 ? "" : "s"} (shadowed by an earlier rule):`;
  const lines = shadowed.map(
    (s) =>
      `  rule #${s.index + 1} [${ruleLabel(s.rule)}] never fires — covered by #${s.shadowedByIndex + 1} [${ruleLabel(s.shadowedBy)}]`,
  );
  return [header, ...lines].join("\n");
}
