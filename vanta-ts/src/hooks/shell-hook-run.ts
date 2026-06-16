import { spawn } from "node:child_process";
import {
  loadShellHooks,
  matchingHooks,
  type ShellHookEvent,
  type ShellHook,
  type MatchContext,
} from "./shell-hooks.js";
import { runMcpToolHook } from "./mcp-hook-run.js";

// Shell hook execution layer. Extracted from shell-hooks.ts (size gate).
// Types, schemas, and match logic stay in shell-hooks.ts.

const DEFAULT_TIMEOUT_MS = 10_000;

/** Dispatch one hook to either the shell runner or the MCP tool runner. */
function runHook(hook: ShellHook, contextJson: string, opts: { cwd?: string }): Promise<ShellHookResult> {
  if (hook.type === "mcp_tool") return runMcpToolHook(hook, contextJson, opts);
  if (!hook.command) return Promise.resolve({ code: 1, stdout: "", stderr: "hook has no command" });
  return runShellHook(hook.command, contextJson, opts);
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
    child.stdin?.on("error", () => {});
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
    const r = await runHook(h, ctx, { cwd: opts.cwd });
    if (r.code !== 0) {
      return { blocked: true, reason: (r.stderr || r.stdout).trim() || `PreToolUse hook exited ${r.code}` };
    }
  }
  return { blocked: false };
}

/**
 * Fire Stop hooks at the end of an agent turn and return the first
 * `additionalContext` string from any hook's stdout JSON. Best-effort — never throws.
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
      const r = await runHook(h, ctx, { cwd: opts.cwd });
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
 * Fire-and-forget: all matching hooks run, exit codes are ignored.
 */
export async function fireHooks(
  dataDir: string,
  event: Exclude<ShellHookEvent, "PreToolUse">,
  context: Record<string, unknown>,
  opts: { toolName?: string; isError?: boolean; prompt?: string; sessionType?: MatchContext["sessionType"]; maintenance?: boolean; cwd?: string } = {},
): Promise<void> {
  try {
    const matchCtx: MatchContext = { toolName: opts.toolName, isError: opts.isError, prompt: opts.prompt, sessionType: opts.sessionType, maintenance: opts.maintenance };
    const hooks = matchingHooks(await loadShellHooks(dataDir), event, matchCtx);
    if (!hooks.length) return;
    const ctx = JSON.stringify({ event, ...context });
    await Promise.all(hooks.map((h: ShellHook) => runHook(h, ctx, { cwd: opts.cwd })));
  } catch {
    // best-effort — a non-blocking hook must never affect the session
  }
}
