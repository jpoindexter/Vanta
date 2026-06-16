import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// Shell-command hooks. Configured in .vanta/hooks.json, these fire external shell
// commands at agent lifecycle events: Setup (bootstrap), SessionStart, PreToolUse
// (before a tool runs), PostToolUse (after), UserPromptSubmit (on user input), Stop (on session end). Each hook
// receives a JSON context on stdin. A PreToolUse hook that exits non-zero BLOCKS
// the tool (fail-closed — a gate that errors should still gate); the other events
// are fire-and-forget. Distinct from plugins/hooks.ts (the in-process JS bus): this
// runs ARBITRARY shell, so it is opt-in via the config file and nothing else.

export type ShellHookEvent = "Setup" | "SessionStart" | "SessionEnd" | "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

const ShellHookSchema = z.object({
  /** Regex on tool name. Applies to PreToolUse / PostToolUse. Absent = match all.
   *  Example: `"toolNamePattern": "write_file|shell_cmd"` */
  toolNamePattern: z.string().optional(),
  /** @deprecated Alias for toolNamePattern. */
  matcher: z.string().optional(),
  /** Regex on serialized tool input JSON. Applies to PreToolUse / PostToolUse.
   *  Example: `"inputPattern": "/etc/"` fires only when input JSON contains /etc/ */
  inputPattern: z.string().optional(),
  /** Regex on the user's prompt text. Applies to UserPromptSubmit.
   *  Example: `"promptPattern": "^/skill"` fires only for skill slash commands */
  promptPattern: z.string().optional(),
  /** If true, only fire when the tool returned an error (ok: false). Applies to PostToolUse. */
  onError: z.boolean().optional(),
  /** Session type filter. Absent = fire in both modes.
   *  "interactive" = REPL / TUI session; "one-shot" = `vanta run`. */
  sessionType: z.enum(["interactive", "one-shot"]).optional(),
  /** If set, only fire when lifecycle context has the same maintenance flag. */
  maintenance: z.boolean().optional(),
  /**
   * Hook type discriminant. Absent or "shell" = shell command (default).
   * "mcp_tool" = invoke an MCP tool directly instead of a subprocess.
   */
  type: z.enum(["shell", "mcp_tool"]).optional(),
  /** Shell command to run (type: "shell" or absent). The JSON context is piped to its stdin. */
  command: z.string().optional(),
  /** MCP server name as defined in .vanta/mcp.json (type: "mcp_tool" only). */
  server: z.string().optional(),
  /** MCP tool name to call (type: "mcp_tool" only). */
  tool: z.string().optional(),
}).refine(
  (h) => h.type === "mcp_tool" ? !!(h.server?.trim() && h.tool?.trim()) : !!(h.command?.trim()),
  { message: "shell hooks require command; mcp_tool hooks require server + tool" },
);
export type ShellHook = z.infer<typeof ShellHookSchema>;

/** Context passed to matchingHooks to evaluate conditional matchers. */
export type MatchContext = {
  toolName?: string;
  toolInputJson?: string;
  prompt?: string;
  isError?: boolean;
  sessionType?: "interactive" | "one-shot";
  maintenance?: boolean;
};

const ShellHooksConfigSchema = z.object({
  Setup: z.array(ShellHookSchema).optional(),
  SessionStart: z.array(ShellHookSchema).optional(),
  SessionEnd: z.array(ShellHookSchema).optional(),
  PreToolUse: z.array(ShellHookSchema).optional(),
  PostToolUse: z.array(ShellHookSchema).optional(),
  UserPromptSubmit: z.array(ShellHookSchema).optional(),
  Stop: z.array(ShellHookSchema).optional(),
});
export type ShellHooksConfig = z.infer<typeof ShellHooksConfigSchema>;

const HOOKS_FILE = "hooks.json";

export function shellHooksPath(dataDir: string): string {
  return join(dataDir, HOOKS_FILE);
}

/** Load + validate .vanta/hooks.json. Returns {} when the file is missing or malformed. */
export async function loadShellHooks(dataDir: string): Promise<ShellHooksConfig> {
  try {
    const raw: unknown = JSON.parse(await readFile(shellHooksPath(dataDir), "utf8"));
    const parsed = ShellHooksConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Returns true if pattern (regex) matches text. Absent pattern = match all; absent text with pattern = no match. */
function matchesPattern(pattern: string | undefined, text: string | undefined): boolean {
  if (pattern === undefined) return true;
  if (text === undefined) return false;
  try { return new RegExp(pattern).test(text); }
  catch { return pattern === text; }
}

function namePatternBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  const pat = hook.toolNamePattern ?? hook.matcher;
  // Tool name patterns only apply when toolName is present; absent = match all (non-tool events).
  return pat !== undefined && ctx.toolName !== undefined && !matchesPattern(pat, ctx.toolName);
}

function sessionTypeBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  return !!(hook.sessionType && ctx.sessionType && hook.sessionType !== ctx.sessionType);
}

function maintenanceBlocked(hook: ShellHook, ctx: MatchContext): boolean {
  return hook.maintenance !== undefined && hook.maintenance !== (ctx.maintenance ?? false);
}

function hookMatches(hook: ShellHook, ctx: MatchContext): boolean {
  if (namePatternBlocked(hook, ctx)) return false;
  if (!matchesPattern(hook.inputPattern, ctx.toolInputJson)) return false;
  if (!matchesPattern(hook.promptPattern, ctx.prompt)) return false;
  if (hook.onError && ctx.isError !== true) return false;
  if (sessionTypeBlocked(hook, ctx)) return false;
  if (maintenanceBlocked(hook, ctx)) return false;
  return true;
}

/** Hooks for an event whose conditional matchers all pass against ctx. */
export function matchingHooks(config: ShellHooksConfig, event: ShellHookEvent, ctx: MatchContext = {}): ShellHook[] {
  return (config[event] ?? []).filter((h) => hookMatches(h, ctx));
}

export type { ShellHookResult } from "./shell-hook-run.js";
export { runShellHook, firePreToolUse, fireStopHook, fireHooks } from "./shell-hook-run.js";
