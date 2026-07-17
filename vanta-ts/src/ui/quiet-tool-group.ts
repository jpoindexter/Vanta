import type { ToolEntry } from "./types.js";

const READ_TOOLS = /^(read|grep|glob|find|list|search|web_fetch|web_search)/i;

export type QuietToolRow =
  | { kind: "reads"; label: string; tools: ToolEntry[] }
  | { kind: "tool"; tool: ToolEntry };

export function quietToolRows(tools: readonly ToolEntry[]): QuietToolRow[] {
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

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
