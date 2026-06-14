// CLI tool-progress verbosity (VANTA_TOOL_PROGRESS), surfaced in `vanta setup`.
// full (default) = tool calls + results · compact = results only · off = text
// only. Affects one-shot/REPL console output; the TUI always renders progress.

export type ToolProgress = "full" | "compact" | "off";

export function toolProgressMode(env: NodeJS.ProcessEnv = process.env): ToolProgress {
  const v = (env.VANTA_TOOL_PROGRESS ?? "").trim().toLowerCase();
  return v === "compact" || v === "off" ? v : "full";
}
