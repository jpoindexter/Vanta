import type { ToolEntry, TurnSummaryEntry } from "./types.js";

const CHANGE = /\b(write|wrote|edit|edited|create|created|update|updated|delete|deleted|remove|removed|patch|patched|move|moved|rename|renamed)\b/i;
const CHECK = /\b(read|searched|search|inspect|inspected|list|listed|find|found|looked)\b/i;
const VERIFY = /\b(test|tests|check|lint|build|typecheck|tsc|vitest|jest|pytest|smoke|verify|verification)\b/i;

export function buildTurnSummary(tools: readonly ToolEntry[]): TurnSummaryEntry | null {
  if (tools.length === 0) return null;
  const changed = unique(tools.filter(isSuccessfulChange).map((tool) => tool.detail).filter(Boolean));
  const checks = tools.filter((tool) => tool.ok !== false && isCheck(tool));
  const verification = tools.filter(isVerification);
  return {
    kind: "turnSummary",
    actions: tools.length,
    changed,
    checked: checks.length,
    verificationPassed: verification.filter((tool) => tool.ok !== false).length,
    verificationFailed: verification.filter((tool) => tool.ok === false).length,
    failures: tools.filter((tool) => tool.ok === false).length,
  };
}

export function turnSummaryLines(summary: TurnSummaryEntry): string[] {
  const lines = [`Summary · ${summary.actions} action${summary.actions === 1 ? "" : "s"}`];
  if (summary.changed.length > 0) lines.push(`Changed: ${targetLabel(summary.changed)}`);
  if (summary.checked > 0) lines.push(`Checked: ${summary.checked} read/search action${summary.checked === 1 ? "" : "s"}`);
  lines.push(`Verification: ${verificationLabel(summary)}`);
  lines.push(`Next: ${summary.failures > 0 ? "Review failed actions in Ctrl+T evidence" : "Ready for review"}`);
  return lines;
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
  if (total === 0) return "Not run";
  const passed = `${summary.verificationPassed} passed`;
  return summary.verificationFailed > 0 ? `${passed} · ${summary.verificationFailed} failed` : passed;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
