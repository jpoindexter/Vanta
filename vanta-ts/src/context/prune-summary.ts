import type { Message } from "../types.js";
import { estTokens } from "../compress/types.js";

// HARNESS-PRUNE-SUMMARY: when context compaction drops old tool results, leave a
// short per-tool placeholder instead of silently deleting them, so the model and
// operator can see WHAT was dropped and roughly how much was freed.
//
// Both functions are PURE. `summarizePrunedTools` aggregates only the tool-result
// messages in the dropped window (other dropped roles carry no per-tool meaning
// here); `buildPruneSummaryNote` renders the aggregate as a one-line note, or null
// when nothing tool-shaped was pruned (no note → no behavior change).

/** Per-tool-name drop counts + estimated freed tokens over a pruned window. */
export type PruneSummary = {
  /** Count of dropped tool results keyed by tool name. */
  toolCounts: Record<string, number>;
  /** Estimated tokens freed by dropping those tool results. */
  freedTokens: number;
};

/** How many top tool names to name explicitly in the note before collapsing the rest. */
const TOP_TOOLS_IN_NOTE = 3;

/** Aggregate the dropped TOOL-RESULT messages into per-name counts + freed tokens. */
export function summarizePrunedTools(prunedMessages: readonly Message[]): PruneSummary {
  const toolCounts: Record<string, number> = {};
  let freedTokens = 0;
  for (const m of prunedMessages) {
    if (m.role !== "tool") continue;
    const name = m.name || "unknown";
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
    freedTokens += estTokens(m.content);
  }
  return { toolCounts, freedTokens };
}

/** "1.2k" / "850" — compact token count for the human/model-facing note. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    const rounded = Math.round(thousands * 10) / 10;
    return `${rounded}k`;
  }
  return String(tokens);
}

/** "3× read_file, 2× shell_cmd" — top tools by count, with the rest collapsed. */
function formatToolBreakdown(toolCounts: Record<string, number>): string {
  const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, TOP_TOOLS_IN_NOTE).map(([name, count]) => `${count}× ${name}`);
  const remaining = sorted.length - TOP_TOOLS_IN_NOTE;
  if (remaining > 0) top.push(`+${remaining} more`);
  return top.join(", ");
}

/**
 * One-line note for a pruned-tool-result window, e.g.
 *   "[pruned 5 earlier tool results: 3× read_file, 2× shell_cmd — ~1.2k tokens freed]"
 * Returns null when nothing tool-shaped was pruned (no note, no behavior change).
 */
export function buildPruneSummaryNote(summary: PruneSummary): string | null {
  const total = Object.values(summary.toolCounts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return null;
  const plural = total === 1 ? "result" : "results";
  const breakdown = formatToolBreakdown(summary.toolCounts);
  return `[pruned ${total} earlier tool ${plural}: ${breakdown} — ~${formatTokens(summary.freedTokens)} tokens freed]`;
}
