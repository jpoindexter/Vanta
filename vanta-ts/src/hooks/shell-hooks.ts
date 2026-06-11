import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// Shell-command hooks. Configured in .vanta/hooks.json, these fire external shell
// commands at agent lifecycle events: PreToolUse (before a tool runs), PostToolUse
// (after), UserPromptSubmit (on user input), Stop (on session end). Each hook
// receives a JSON context on stdin. A PreToolUse hook that exits non-zero BLOCKS
// the tool (fail-closed — a gate that errors should still gate); the other events
// are fire-and-forget. Distinct from plugins/hooks.ts (the in-process JS bus): this
// runs ARBITRARY shell, so it is opt-in via the config file and nothing else.

export type ShellHookEvent = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

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
  /** Shell command to run; the JSON context is piped to its stdin. */
  command: z.string().min(1),
});
export type ShellHook = z.infer<typeof ShellHookSchema>;

/** Context passed to matchingHooks to evaluate conditional matchers. */
export type MatchContext = {
  toolName?: string;
  toolInputJson?: string;
  prompt?: string;
  isError?: boolean;
  sessionType?: "interactive" | "one-shot";
};

const ShellHooksConfigSchema = z.object({
  PreToolUse: z.array(ShellHookSchema).optional(),
  PostToolUse: z.array(ShellHookSchema).optional(),
  UserPromptSubmit: z.array(ShellHookSchema).optional(),
  Stop: z.array(ShellHookSchema).optional(),
});
export type ShellHooksConfig = z.infer<typeof ShellHooksConfigSchema>;

const HOOKS_FILE = "hooks.json";
const DEFAULT_TIMEOUT_MS = 10_000;

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

function hookMatches(hook: ShellHook, ctx: MatchContext): boolean {
  if (namePatternBlocked(hook, ctx)) return false;
  if (!matchesPattern(hook.inputPattern, ctx.toolInputJson)) return false;
  if (!matchesPattern(hook.promptPattern, ctx.prompt)) return false;
  if (hook.onError && ctx.isError !== true) return false;
  if (sessionTypeBlocked(hook, ctx)) return false;
  return true;
}

/** Hooks for an event whose conditional matchers all pass against ctx. */
export function matchingHooks(config: ShellHooksConfig, event: ShellHookEvent, ctx: MatchContext = {}): ShellHook[] {
  return (config[event] ?? []).filter((h) => hookMatches(h, ctx));
}

export type ShellHookResult = { code: number; stdout: string; stderr: string };

/**
 * Spawn one shell hook, piping the JSON context to its stdin. Resolves with the
 * exit code + captured output. A spawn failure resolves to code 0 (fail-open on
 * a broken shell); a timeout resolves to code 124.
 */
export function runShellHook(
  command: string,
  contextJson: string,
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<ShellHookResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, { shell: true, cwd: opts.cwd });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: 124, stdout, stderr: `${stderr}\n[hook timed out]` });
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.stdout?.on("data", (d) => { stdout += String(d); });
    child.stderr?.on("data", (d) => { stderr += String(d); });
    child.on("error", () => { clearTimeout(timer); resolve({ code: 0, stdout, stderr }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
    child.stdin?.end(contextJson);
  });
}

/**
 * Run the PreToolUse hooks for a tool. If any matching hook exits non-zero, the
 * tool is BLOCKED and the hook's output is the reason. No matching hooks → allowed.
 */
export async function firePreToolUse(
  dataDir: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: { cwd?: string; sessionType?: MatchContext["sessionType"] } = {},
): Promise<{ blocked: boolean; reason?: string }> {
  const matchCtx: MatchContext = { toolName, toolInputJson: JSON.stringify(args), sessionType: opts.sessionType };
  const hooks = matchingHooks(await loadShellHooks(dataDir), "PreToolUse", matchCtx);
  if (!hooks.length) return { blocked: false };
  const ctx = JSON.stringify({ event: "PreToolUse", tool: toolName, args });
  for (const h of hooks) {
    const r = await runShellHook(h.command, ctx, { cwd: opts.cwd });
    if (r.code !== 0) {
      return { blocked: true, reason: (r.stderr || r.stdout).trim() || `PreToolUse hook exited ${r.code}` };
    }
  }
  return { blocked: false };
}

/**
 * Fire Stop hooks at the end of an agent turn and return the first
 * `additionalContext` string from any hook's stdout JSON. When a Stop hook
 * returns `{"additionalContext": "..."}` the caller can re-send that text as
 * the next agent turn without user input (hook-driven feedback loop).
 * Best-effort — never throws; returns null if no context is found.
 */
export async function fireStopHook(
  dataDir: string,
  context: Record<string, unknown>,
  opts: { cwd?: string } = {},
): Promise<string | null> {
  try {
    const hooks = matchingHooks(await loadShellHooks(dataDir), "Stop");
    if (!hooks.length) return null;
    const ctx = JSON.stringify({ event: "Stop", ...context });
    for (const h of hooks) {
      const r = await runShellHook(h.command, ctx, { cwd: opts.cwd });
      try {
        const parsed: unknown = JSON.parse(r.stdout.trim());
        const ac = (parsed as { additionalContext?: unknown })?.additionalContext;
        if (typeof ac === "string" && ac.trim()) return ac.trim();
      } catch { /* stdout is not JSON — no additionalContext */ }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fire the hooks for a non-blocking event (PostToolUse / UserPromptSubmit / Stop).
 * Fire-and-forget: all matching hooks run, exit codes are ignored, and any error
 * is swallowed so a hook can never break the turn.
 */
export async function fireHooks(
  dataDir: string,
  event: Exclude<ShellHookEvent, "PreToolUse">,
  context: Record<string, unknown>,
  opts: { toolName?: string; isError?: boolean; prompt?: string; sessionType?: MatchContext["sessionType"]; cwd?: string } = {},
): Promise<void> {
  try {
    const matchCtx: MatchContext = { toolName: opts.toolName, isError: opts.isError, prompt: opts.prompt, sessionType: opts.sessionType };
    const hooks = matchingHooks(await loadShellHooks(dataDir), event, matchCtx);
    if (!hooks.length) return;
    const ctx = JSON.stringify({ event, ...context });
    await Promise.all(hooks.map((h) => runShellHook(h.command, ctx, { cwd: opts.cwd })));
  } catch {
    // best-effort — a non-blocking hook must never affect the session
  }
}
