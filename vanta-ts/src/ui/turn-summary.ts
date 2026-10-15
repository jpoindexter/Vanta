import type { ToolEntry, TurnSummaryEntry } from "./types.js";

const CHANGE = /\b(write|wrote|edit|edited|create|created|update|updated|delete|deleted|remove|removed|patch|patched|move|moved|rename|renamed)\b/i;
const CHECK = /\b(read|searched|search|inspect|inspected|list|listed|find|found|looked)\b/i;
const VERIFY = /\b(test|tests|check|lint|build|typecheck|tsc|vitest|jest|pytest|smoke|verify|verification)\b/i;
const COMPLETION_CLAIM = /\b(done|fixed|completed?|verified|working|works|passed|successful|ready)\b/i;
const NEGATED_COMPLETION = /\b(?:not|never|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|can['’]t|cannot)\s+(?:been\s+)?(?:done|fixed|completed?|verified|working|passing|ready)\b/gi;

export function buildTurnSummary(tools: readonly ToolEntry[], assistantText = ""): TurnSummaryEntry | null {
  if (tools.length === 0) return null;
  const changed = unique(tools.filter(isSuccessfulChange).map((tool) => tool.detail).filter(Boolean));
  const checks = tools.filter((tool) => tool.ok !== false && isCheck(tool));
  const verification = tools.filter(isVerification);
  const { recovered, unresolved } = classifyFailures(tools);
  return {
    kind: "turnSummary",
    actions: tools.length,
    changed,
    checked: checks.length,
    verificationPassed: verification.filter((tool) => tool.ok !== false).length,
    verificationFailed: verification.filter((tool) => tool.ok === false).length,
    completionClaimUnverified: verification.length === 0 && claimsCompletion(assistantText),
    recoveredFailures: recovered,
    failures: unresolved,
  };
}

export function turnSummaryLines(summary: TurnSummaryEntry): string[] {
  const lines = [`Summary · ${summary.actions} action${summary.actions === 1 ? "" : "s"}`];
  if (summary.changed.length > 0) lines.push(`Changed: ${targetLabel(summary.changed)}`);
  if (summary.checked > 0) lines.push(`Checked: ${summary.checked} read/search action${summary.checked === 1 ? "" : "s"}`);
  lines.push(`Verification: ${verificationLabel(summary)}`);
  if (summary.recoveredFailures > 0) {
    lines.push(`Recovered: ${summary.recoveredFailures} transient failure${summary.recoveredFailures === 1 ? "" : "s"}`);
  }
  const next = summary.failures > 0
    ? "Review failed actions in Ctrl+T evidence"
    : summary.completionClaimUnverified
      ? "Run the real acceptance check"
      : "Ready for review";
  lines.push(`Next: ${next}`);
  return lines;
}

function toolActionKey(tool: ToolEntry): string {
  return `${tool.name}\u0000${tool.detail.trim()}`;
}

/** A later successful retry of the same displayed action resolves the earlier
 * failure. We retain every receipt in Ctrl+T; only the closeout's attention
 * state changes, so recovered attempts do not masquerade as open failures. */
function classifyFailures(tools: readonly ToolEntry[]): { recovered: number; unresolved: number } {
  const laterSuccesses = new Set<string>();
  let recovered = 0;
  let unresolved = 0;
  for (let index = tools.length - 1; index >= 0; index -= 1) {
    const tool = tools[index]!;
    const key = toolActionKey(tool);
    if (tool.ok === false) {
      if (laterSuccesses.has(key)) recovered += 1;
      else unresolved += 1;
    } else {
      laterSuccesses.add(key);
    }
  }
  return { recovered, unresolved };
}

function isSuccessfulChange(tool: ToolEntry): boolean {
  return tool.ok !== false && CHANGE.test(`${tool.name} ${tool.verb}`);
}

function isCheck(tool: ToolEntry): boolean {
  return CHECK.test(`${tool.name} ${tool.verb}`);
}

function isVerification(tool: ToolEntry): boolean {
  return VERIFY.test(`${tool.name} ${tool.verb} ${tool.detail}`);
}

function targetLabel(targets: readonly string[]): string {
  if (targets.length === 1) return targets[0]!;
  const extra = targets.length - 1;
  return `${targets[0]} · +${extra} more target${extra === 1 ? "" : "s"}`;
}

function verificationLabel(summary: TurnSummaryEntry): string {
  const total = summary.verificationPassed + summary.verificationFailed;
  if (total === 0) return summary.completionClaimUnverified ? "Not run · completion claim unproven" : "Not run";
  const passed = `${summary.verificationPassed} passed`;
  return summary.verificationFailed > 0 ? `${passed} · ${summary.verificationFailed} failed` : passed;
}

function claimsCompletion(text: string): boolean {
  return COMPLETION_CLAIM.test(text.replace(NEGATED_COMPLETION, ""));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
