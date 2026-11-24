import type { ToolEntry } from "./types.js";

const READ_TOOLS = /^(read|grep|glob|find|list|search|web_fetch|web_search)/i;
const CHANGE_TOOLS = /^(write|edit|apply_patch|replace|move|rename|delete|roadmap_move)/i;
const COMMAND_TOOLS = /^(shell|run|exec)/i;
const PLAN_TOOLS = /^(todo|task)/i;
const COMPACT_RUN_AT = 4;

export type QuietToolRow =
  | { kind: "reads"; label: string; tools: ToolEntry[] }
  | { kind: "summary"; label: string; tools: ToolEntry[] }
  | { kind: "tool"; tool: ToolEntry };

export function quietToolRows(tools: readonly ToolEntry[]): QuietToolRow[] {
  if (tools.length >= COMPACT_RUN_AT) return compactRunRows(tools);
  const reads = tools.filter((tool) => tool.ok !== false && READ_TOOLS.test(tool.name));
  const rest = tools.filter((tool) => !reads.includes(tool));
  const rows: QuietToolRow[] = [];
  if (reads.length > 1) {
    const labels = new Set(reads.map((tool) => tool.detail).filter(Boolean));
    rows.push({
      kind: "reads",
      label: reads.length === 1
        ? `${capitalize(reads[0]!.verb)}${reads[0]!.detail ? `(${reads[0]!.detail})` : ""}`
        : `Read and searched ${reads.length} times${labels.size ? ` across ${labels.size} target${labels.size === 1 ? "" : "s"}` : ""}`,
      tools: reads,
    });
  }
  if (reads.length === 1) rows.push({ kind: "tool", tool: reads[0]! });
  rows.push(...rest.map((tool): QuietToolRow => ({ kind: "tool", tool })));
  return rows;
}

function compactRunRows(tools: readonly ToolEntry[]): QuietToolRow[] {
  const completed = tools.filter((tool) => tool.ok !== false);
  const failed = tools.filter((tool) => tool.ok === false);
  const rows: QuietToolRow[] = [];
  if (completed.length > 0) {
    rows.push({
      kind: "summary",
      label: compactRunLabel(completed, failed.length > 0),
      tools: completed,
    });
  }
  rows.push(...failed.map((tool): QuietToolRow => ({ kind: "tool", tool })));
  return rows;
}

function compactRunLabel(tools: readonly ToolEntry[], hasFailures: boolean): string {
  const counts = {
    reads: tools.filter((tool) => READ_TOOLS.test(tool.name)).length,
    edits: tools.filter((tool) => CHANGE_TOOLS.test(`${tool.name} ${tool.verb}`)).length,
    commands: tools.filter((tool) => COMMAND_TOOLS.test(`${tool.name} ${tool.verb}`)).length,
    plans: tools.filter((tool) => PLAN_TOOLS.test(tool.name)).length,
  };
  const classified = counts.reads + counts.edits + counts.commands + counts.plans;
  const segments = [
    hasFailures ? `${tools.length} completed` : `${tools.length} actions`,
    countLabel(counts.reads, "read/search"),
    countLabel(counts.edits, "edit"),
    countLabel(counts.commands, "command"),
    countLabel(counts.plans, "plan update"),
    countLabel(tools.length - classified, "other"),
  ].filter(Boolean);
  return segments.join(" · ");
}

function countLabel(count: number, label: string): string {
  return count > 0 ? `${count} ${label}${count === 1 || label === "read/search" ? "" : "s"}` : "";
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
