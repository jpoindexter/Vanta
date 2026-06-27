import { readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { isProjectTrusted } from "../settings/trust.js";

// Lifecycle hooks configured in .vanta/hooks.json. PreToolUse hooks that return
// non-zero BLOCK the tool; other events are best-effort. Distinct from
// plugins/hooks.ts (the in-process JS bus): command hooks can run arbitrary
// shell — so a PROJECT's .vanta/hooks.json is attacker-controllable when Vanta
// operates on an untrusted repo (clone → zero-click RCE). Project hooks load
// ONLY for a trusted project (the same gate as context files + MCP). The user's
// own ~/.vanta hooks always load; VANTA_ENABLE_PROJECT_HOOKS=1 is the opt-in.

export const SHELL_HOOK_EVENTS = [
  "SessionStart",
  "Setup",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "MessageDisplay",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "Elicitation",
  "ElicitationResult",
] as const;
export type ShellHookEvent = typeof SHELL_HOOK_EVENTS[number];

export const ShellHookSchema = z.object({
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
  /** PostToolUse only. If true, a block (exit 2) does NOT hard-stop the turn: the
   *  rejection reason is fed BACK to the model (appended to the tool result) so it
   *  can adapt and continue. Absent/false = a block hard-stops, as today. */
  continueOnBlock: z.boolean().optional(),
  /** Session type filter. Absent = fire in both modes.
   *  "interactive" = REPL / TUI session; "one-shot" = `vanta run`. */
  sessionType: z.enum(["interactive", "one-shot"]).optional(),
  /** If set, only fire when lifecycle context has the same maintenance flag. */
  maintenance: z.boolean().optional(),
  /** Hook type. Absent, "shell", or "command" = shell command. */
  type: z.enum(["shell", "command", "http", "mcp_tool", "prompt", "agent"]).optional(),
  /** Shell command to run. The JSON context is piped to stdin. */
  command: z.string().optional(),
  /** Argv for a command/shell hook spawned DIRECTLY via execFile (no shell):
   *  args[0] is the file, the rest are arguments. Takes precedence over
   *  `command` and avoids shell interpretation/injection. The JSON context is
   *  still piped to the child's stdin. Example: `"args": ["jq", ".tool"]`. */
  args: z.array(z.string()).optional(),
  /** HTTP endpoint for type:http. Vanta POSTs the hook context as JSON. */
  url: z.string().url().optional(),
  /** Static HTTP headers for type:http; `$NAME`/`${NAME}` values expand only from allowedEnvVars. */
  headers: z.record(z.string(), z.string()).optional(),
  /** Env var names a hook may receive in the HTTP body or expand in headers. */
  allowedEnvVars: z.array(z.string()).optional(),
  /** Model instruction for type:prompt or type:agent. */
  prompt: z.string().optional(),
  /** Optional structured-output schema for type:agent. */
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  /** Per-hook timeout override. */
  timeoutMs: z.number().int().positive().optional(),
  /** Run at most once per process for the same event + hook config. */
  once: z.boolean().optional(),
  /** Run asynchronously (fire-and-forget) so it does not block the REPL becoming
   *  interactive. Currently honored for SessionStart; absent/false = inline. */
  defer: z.boolean().optional(),
  /** Human-facing status line emitted before running the hook when the host supports it. */
  statusMessage: z.string().optional(),
  /** Max agent iterations for type:agent. */
  maxIterations: z.number().int().positive().optional(),
  /** MCP server name as defined in .vanta/mcp.json (type: "mcp_tool" only). */
  server: z.string().optional(),
  /** MCP tool name to call (type: "mcp_tool" only). */
  tool: z.string().optional(),
}).refine(
  (h) => {
    const type = h.type ?? "shell";
    if (type === "mcp_tool") return !!(h.server?.trim() && h.tool?.trim());
    if (type === "http") return !!h.url?.trim();
    if (type === "prompt" || type === "agent") return !!h.prompt?.trim();
    // command/shell: an exec-form argv (non-empty, non-blank file) OR a shell command.
    if (h.args !== undefined) return !!h.args[0]?.trim();
    return !!h.command?.trim();
  },
  { message: "hook config is missing required fields for its type" },
);
export type ShellHook = z.infer<typeof ShellHookSchema>;

/** Context passed to matchingHooks to evaluate conditional matchers. */
export type MatchContext = {
  toolName?: string;
  toolInputJson?: string;
  matcherValue?: string;
  prompt?: string;
  isError?: boolean;
  sessionType?: "interactive" | "one-shot";
  maintenance?: boolean;
};

const hookEventEntries = SHELL_HOOK_EVENTS.map((event) => [event, z.array(ShellHookSchema).optional()] as const);
const ShellHooksConfigSchema = z.object(Object.fromEntries(hookEventEntries) as Record<ShellHookEvent, z.ZodOptional<z.ZodArray<typeof ShellHookSchema>>>);
export type ShellHooksConfig = z.infer<typeof ShellHooksConfigSchema>;

const HOOKS_FILE = "hooks.json";

export function shellHooksPath(dataDir: string): string {
  return join(dataDir, HOOKS_FILE);
}

function projectHooksOptIn(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_ENABLE_PROJECT_HOOKS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** SECURITY GATE: which `.vanta/hooks.json` may load. User scope (~/.vanta) and an
 * explicit opt-in always pass; a project's hooks load only when that project is
 * TRUSTED (so a cloned/untrusted repo's hooks can't auto-run shell). Fails closed. */
export async function hooksAllowed(dataDir: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (resolve(dataDir) === resolve(resolveVantaHome(env))) return true; // user's own machine config
  if (projectHooksOptIn(env)) return true;
  return isProjectTrusted(dirname(resolve(dataDir))).catch(() => false);
}

/** Load + validate .vanta/hooks.json. Returns {} when untrusted, missing, or malformed. */
export async function loadShellHooks(dataDir: string): Promise<ShellHooksConfig> {
  if (!(await hooksAllowed(dataDir, process.env))) return {};
  try {
    const raw: unknown = JSON.parse(await readFile(shellHooksPath(dataDir), "utf8"));
    const parsed = ShellHooksConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

// The conditional-matcher logic (which hooks fire for an event) lives in a
// sibling so this file stays the schema + loader concern. Re-exported here for a
// stable import path (interactive.ts / shell-hook-run.ts / file-watch.ts).
export { matchingHooks } from "./shell-hook-match.js";

export type { ShellHookResult } from "./shell-hook-run.js";
export { runShellHook, runExecHook, runOneHook, firePreToolUse, firePostToolUse, fireStopHook, fireStatusHook, fireHooks } from "./shell-hook-run.js";
