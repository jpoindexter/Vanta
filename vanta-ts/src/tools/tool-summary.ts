/** Tool batch summarization — generates brief (~30 char) labels for tool call results. */

export interface ToolCallBatch {
  toolName: string;
  args: Record<string, unknown>;
  result: { ok: boolean; output: string };
}

/** Generate a concise git-commit-style summary of a tool call or batch. */
export function summarizeToolBatch(batches: ToolCallBatch[]): string {
  if (!batches.length) return "";

  const firstTool = batches[0]!.toolName;
  const count = batches.length;

  // Patterns for common tools
  if (firstTool === "read_file" && count <= 3) {
    return `read ${count} file${count > 1 ? "s" : ""}`;
  }
  if (firstTool === "write_file" && count <= 3) {
    return `write ${count} file${count > 1 ? "s" : ""}`;
  }
  if (firstTool === "git_commit") {
    return "commit";
  }
  if (firstTool === "shell_cmd") {
    const cmd = String(batches[0]?.args.command ?? "").split(" ")[0];
    return `run ${cmd || "cmd"}`;
  }
  if (firstTool === "web_search") {
    return "search";
  }

  // Fallback: tool name + count
  return count === 1 ? firstTool : `${firstTool} (${count}x)`;
}

/** Format a batch summary for progress display. Truncate to ~30 chars. */
export function formatToolSummary(summary: string): string {
  return summary.slice(0, 30);
}
