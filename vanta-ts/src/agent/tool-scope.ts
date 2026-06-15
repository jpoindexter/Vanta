import type { Message } from "../types.js";
import type { ToolSchema } from "../providers/interface.js";

const MIN_SCOPE_THRESHOLD = 16;
const CORE = ["tool_search", "clarify", "brain", "recall", "inspect_state", "read_file", "grep_files", "glob_files"];

const GROUPS: Record<string, string[]> = {
  code: ["git_status", "git_diff", "lsp_diagnostics", "lsp_definition", "edit_file", "write_file", "shell_cmd", "run_code"],
  research: ["web_search", "web_fetch", "browser_read", "browser_navigate", "screenshot", "life_search", "ref_search", "ref_ingest"],
  comms: ["gmail_search", "gmail_read", "gmail_draft", "calendar_read", "send_message"],
  business: ["money", "radar", "world", "life_search", "graph_query"],
  ops: ["todo", "loop", "team", "regression_lock", "roadmap_move", "roadmap_add"],
  media: ["describe_image", "compare_vision", "look_at_screen", "look_at_camera", "transcribe", "speak"],
};

const HINTS: Array<[RegExp, keyof typeof GROUPS]> = [
  [/\b(code|test|typescript|tsc|build|commit|git|file|bug|fix|repo|diff|lint)\b/i, "code"],
  [/\b(research|source|market|web|browser|search|read|evidence|solutioning|recommendation)\b/i, "research"],
  [/\b(email|gmail|calendar|message|schedule|meeting|outreach|draft)\b/i, "comms"],
  [/\b(revenue|money|opportunity|prospect|business|market|customer|price)\b/i, "business"],
  [/\b(roadmap|task|team|loop|verify|regression|todo|plan)\b/i, "ops"],
  [/\b(image|screen|camera|audio|voice|transcribe|vision)\b/i, "media"],
];

export function scopeToolSchemas(
  schemas: ToolSchema[],
  context: string,
  opts: { env?: NodeJS.ProcessEnv } = {},
): ToolSchema[] {
  if (schemas.length <= MIN_SCOPE_THRESHOLD || opts.env?.VANTA_TOOL_SCOPE === "0" || wantsFullTools(context)) return schemas;
  const wanted = new Set(CORE);
  for (const [pattern, group] of HINTS) {
    if (pattern.test(context)) GROUPS[group]!.forEach((name) => wanted.add(name));
  }
  if (wanted.size === CORE.length) GROUPS.research!.forEach((name) => wanted.add(name));
  const scoped = schemas.filter((schema) => wanted.has(schema.name));
  return scoped.length ? scoped : schemas;
}

export function toolScopeContext(messages: Message[], activeGoalText?: string): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const content = lastUser?.role === "user" ? lastUser.content : "";
  return [activeGoalText, content].filter(Boolean).join("\n");
}

export function toolScopeSummary(all: ToolSchema[], scoped: ToolSchema[]): string {
  if (all.length === scoped.length) return `tool scope: full set (${all.length}/${all.length})`;
  const reduction = Math.round((1 - scoped.length / all.length) * 100);
  return `tool scope: ${scoped.length}/${all.length} schemas exposed (${reduction}% reduction); use tool_search for more.`;
}

function wantsFullTools(context: string): boolean {
  return /\b(all tools|full toolset|full tools|use any tool|disable tool scope)\b/i.test(context);
}
