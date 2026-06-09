/** Tool batch summarization — generates brief (~30 char) labels for tool call results. */

export interface ToolCallBatch {
  toolName: string;
  args: Record<string, unknown>;
  result: { ok: boolean; output: string };
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function matchKnownPattern(tool: string, count: number, firstArgs: Record<string, unknown>): string | null {
  if (tool === "read_file" && count <= 3) {
    return `read ${count} ${pluralize(count, "file", "files")}`;
  }
  if (tool === "write_file" && count <= 3) {
    return `write ${count} ${pluralize(count, "file", "files")}`;
  }
  if (tool === "git_commit") return "commit";
  if (tool === "shell_cmd") {
    const cmd = String(firstArgs.command ?? "").split(" ")[0];
    return `run ${cmd || "cmd"}`;
  }
  if (tool === "web_search") return "search";
  return null;
}

/** Generate a concise git-commit-style summary of a tool call or batch. */
export function summarizeToolBatch(batches: ToolCallBatch[]): string {
  if (!batches.length) return "";
  const firstTool = batches[0]!.toolName;
  const count = batches.length;
  const pattern = matchKnownPattern(firstTool, count, batches[0]!.args);
  if (pattern) return pattern;
  return count === 1 ? firstTool : `${firstTool} (${count}x)`;
}

/** Format a batch summary for progress display. Truncate to ~30 chars. */
export function formatToolSummary(summary: string): string {
  return summary.slice(0, 30);
}
