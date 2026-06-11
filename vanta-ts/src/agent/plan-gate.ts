/**
 * Plan mode: whitelist of tools that are permitted while plan mode is
 * active and the plan has not yet been approved. Default-deny: anything NOT on
 * this list is blocked, so adding a new write tool doesn't silently bypass the gate.
 */
export const PLAN_MODE_ALLOWED_TOOLS = new Set([
  "read_file",
  "edit_file",      // read-path is safe; write-path is blocked by this gate upstream
  "grep_files",
  "glob_files",
  "recall",
  "web_search",
  "web_fetch",
  "lsp_diagnostics",
  "lsp_definition",
  "git_status",
  "git_diff",
  "inspect_state",
  "clarify",
  "screenshot",
  "look_at_screen",
  "look_at_camera",
  "describe_image",
  "compare_vision",
  "watch_video",
  "tool_search",
  "graph_query",
  "bg_list",
  "bg_status",
  "ref_search",
  "ref_list",
  "retrieve_original",
  "todo",           // reading/planning the task list is safe
]);

/** Returns true when plan mode is active and the named tool is not on the allowlist. */
export function isPlanBlocked(name: string, planGate: (() => boolean) | undefined): boolean {
  return (planGate?.() ?? false) && !PLAN_MODE_ALLOWED_TOOLS.has(name);
}
