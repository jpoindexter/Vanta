import type { Message } from "../types.js";
import type { ToolSchema } from "../providers/interface.js";
import { shouldDeferTools } from "./tool-scope-auto.js";

const MIN_SCOPE_THRESHOLD = 16;
const TOOL_SEARCH_CONTEXT_LIMIT = 3;
// Always in scope — the universal primitives an operator needs every turn,
// regardless of the request's keywords. WRITING a file or running a command must
// never require a tool_search round-trip (that flailing stalled real tasks).
const CORE = [
  "tool_search", "clarify", "brain", "recall", "inspect_state",
  "read_file", "write_file", "edit_file", "shell_cmd", "grep_files", "glob_files",
];

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
  if (schemas.length <= MIN_SCOPE_THRESHOLD || !shouldDeferTools(schemas, opts.env) || wantsFullTools(context)) return schemas;
  const wanted = new Set(CORE);
  for (const [pattern, group] of HINTS) {
    if (pattern.test(context)) GROUPS[group]!.forEach((name) => wanted.add(name));
  }
  for (const schema of schemas) {
    if (mentionsToolName(context, schema.name)) wanted.add(schema.name);
  }
  if (wanted.size === CORE.length) GROUPS.research!.forEach((name) => wanted.add(name));
  const scoped = schemas.filter((schema) => wanted.has(schema.name));
  return scoped.length ? scoped : schemas;
}

export function toolScopeContext(messages: Message[], activeGoalText?: string): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const content = lastUser?.role === "user" ? lastUser.content : "";
  const searched = searchedToolNames(messages);
  const searchedBlock = searched.length ? `searched tool schemas:\n${searched.join("\n")}` : "";
  return [activeGoalText, content, searchedBlock].filter(Boolean).join("\n");
}

export function toolScopeSummary(all: ToolSchema[], scoped: ToolSchema[]): string {
  if (all.length === scoped.length) return `tool scope: full set (${all.length}/${all.length})`;
  const reduction = Math.round((1 - scoped.length / all.length) * 100);
  return `tool scope: ${scoped.length}/${all.length} schemas exposed (${reduction}% reduction); use tool_search for more.`;
}

function wantsFullTools(context: string): boolean {
  return /\b(all tools|full toolset|full tools|use any tool|disable tool scope)\b/i.test(context);
}

function searchedToolNames(messages: Message[]): string[] {
  const found = new Set<string>();
  const results = messages
    .filter((m): m is Extract<Message, { role: "tool" }> => m.role === "tool" && m.name === "tool_search")
    .slice(-TOOL_SEARCH_CONTEXT_LIMIT);
  for (const result of results) {
    for (const match of result.content.matchAll(/^## ([A-Za-z0-9_-]+)$/gm)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found];
}

function mentionsToolName(context: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i").test(context);
}
