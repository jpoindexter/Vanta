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
  /** Tool-name match (regex) for the tool events; ignored for UserPromptSubmit/Stop. Absent = match all. */
  matcher: z.string().optional(),
  /** Shell command to run; the JSON context is piped to its stdin. */
  command: z.string().min(1),
});
export type ShellHook = z.infer<typeof ShellHookSchema>;

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

/** Hooks for an event whose matcher matches the tool name (or that have no matcher). */
export function matchingHooks(config: ShellHooksConfig, event: ShellHookEvent, toolName?: string): ShellHook[] {
  const hooks = config[event] ?? [];
  return hooks.filter((h) => {
    if (!h.matcher || toolName === undefined) return true;
    try {
      return new RegExp(h.matcher).test(toolName);
    } catch {
      return h.matcher === toolName; // invalid regex → exact-match fallback
    }
  });
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
  opts: { cwd?: string } = {},
): Promise<{ blocked: boolean; reason?: string }> {
  const hooks = matchingHooks(await loadShellHooks(dataDir), "PreToolUse", toolName);
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
 * Fire the hooks for a non-blocking event (PostToolUse / UserPromptSubmit / Stop).
 * Fire-and-forget: all matching hooks run, exit codes are ignored, and any error
 * is swallowed so a hook can never break the turn.
 */
export async function fireHooks(
  dataDir: string,
  event: Exclude<ShellHookEvent, "PreToolUse">,
  context: Record<string, unknown>,
  opts: { toolName?: string; cwd?: string } = {},
): Promise<void> {
  try {
    const hooks = matchingHooks(await loadShellHooks(dataDir), event, opts.toolName);
    if (!hooks.length) return;
    const ctx = JSON.stringify({ event, ...context });
    await Promise.all(hooks.map((h) => runShellHook(h.command, ctx, { cwd: opts.cwd })));
  } catch {
    // best-effort — a non-blocking hook must never affect the session
  }
}
