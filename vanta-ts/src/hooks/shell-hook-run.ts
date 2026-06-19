import { spawn } from "node:child_process";
import {
  loadShellHooks,
  matchingHooks,
  type ShellHookEvent,
  type ShellHook,
  type MatchContext,
} from "./shell-hooks.js";
import { runMcpToolHook } from "./mcp-hook-run.js";
import { runHttpHook } from "./http-hook-run.js";
import { runPromptHook } from "./prompt-hook-run.js";
import type { LLMProvider } from "../providers/interface.js";

// Hook execution layer. Extracted from shell-hooks.ts (size gate).
// Types, schemas, and match logic stay in shell-hooks.ts.

const DEFAULT_TIMEOUT_MS = 10_000;
const ONCE_KEYS = new Set<string>();

export type HookRunDeps = {
  promptProvider?: LLMProvider;
  runAgentHook?: (hook: ShellHook, contextJson: string) => Promise<ShellHookResult>;
  onStatus?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
};

type HookRunOpts = HookRunDeps & { cwd?: string };

/** Dispatch one hook to its configured type adapter. */
function runHook(hook: ShellHook, event: ShellHookEvent, contextJson: string, opts: HookRunOpts): Promise<ShellHookResult> {
  if (hook.once && seenOnce(event, hook)) return Promise.resolve({ code: 0, stdout: "[hook skipped: once]", stderr: "" });
  if (hook.statusMessage) opts.onStatus?.(hook.statusMessage);
  const run = () => runHookNow(hook, contextJson, opts);
  return withHookTimeout(run(), hook.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

function runHookNow(hook: ShellHook, contextJson: string, opts: HookRunOpts): Promise<ShellHookResult> {
  const type = hook.type ?? "shell";
  if (type === "mcp_tool") return runMcpToolHook(hook, contextJson, opts);
  if (type === "http") return runHttpHook(hook, contextJson, { env: opts.env, timeoutMs: hook.timeoutMs });
  if (type === "prompt") return runPromptHook(hook, contextJson, { provider: opts.promptProvider });
  if (type === "agent") return opts.runAgentHook ? opts.runAgentHook(hook, contextJson) : Promise.resolve({ code: 1, stdout: "", stderr: "agent hook requires agent deps" });
  if (!hook.command) return Promise.resolve({ code: 1, stdout: "", stderr: "hook has no command" });
  return runShellHook(hook.command, contextJson, { cwd: opts.cwd, timeoutMs: hook.timeoutMs });
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

function seenOnce(event: ShellHookEvent, hook: ShellHook): boolean {
  const key = `${event}:${JSON.stringify(hook)}`;
  if (ONCE_KEYS.has(key)) return true;
  ONCE_KEYS.add(key);
  return false;
}

function withHookTimeout(promise: Promise<ShellHookResult>, timeoutMs: number): Promise<ShellHookResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ShellHookResult>((resolve) => {
    timer = setTimeout(() => resolve({ code: 124, stdout: "", stderr: "[hook timed out]" }), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Run the PreToolUse hooks for a tool. If any matching hook exits non-zero, the
 * tool is BLOCKED and the hook's output is the reason. No matching hooks → allowed.
 */
export async function firePreToolUse(
  dataDir: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: HookRunOpts & { sessionType?: MatchContext["sessionType"] } = {},
): Promise<{ blocked: boolean; reason?: string }> {
  const matchCtx: MatchContext = { toolName, matcherValue: toolName, toolInputJson: JSON.stringify(args), sessionType: opts.sessionType };
  const hooks = matchingHooks(await loadShellHooks(dataDir), "PreToolUse", matchCtx);
  if (!hooks.length) return { blocked: false };
  const ctx = JSON.stringify({ event: "PreToolUse", tool: toolName, args });
  for (const h of hooks) {
    const r = await runHook(h, "PreToolUse", ctx, opts);
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
  opts: HookRunOpts = {},
): Promise<string | null> {
  try {
    const hooks = matchingHooks(await loadShellHooks(dataDir), "Stop");
    if (!hooks.length) return null;
    const ctx = JSON.stringify({ event: "Stop", ...context });
    for (const h of hooks) {
      const r = await runHook(h, "Stop", ctx, opts);
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
 * Collect a custom status-line segment from MessageDisplay hooks (matcher value
 * "status"). Returns the first hook stdout JSON `statusSegment` string. Pure
 * best-effort: any error, timeout, or non-JSON output yields null and never
 * blocks the caller (the status line renders regardless).
 */
export async function fireStatusHook(
  dataDir: string,
  context: Record<string, unknown>,
  opts: HookRunOpts = {},
): Promise<string | null> {
  try {
    const matchCtx: MatchContext = { matcherValue: "status" };
    const hooks = matchingHooks(await loadShellHooks(dataDir), "MessageDisplay", matchCtx);
    if (!hooks.length) return null;
    const ctx = JSON.stringify({ event: "MessageDisplay", segment: "status", ...context });
    for (const h of hooks) {
      const r = await runHook(h, "MessageDisplay", ctx, opts);
      try {
        const parsed: unknown = JSON.parse(r.stdout.trim());
        const seg = (parsed as { statusSegment?: unknown })?.statusSegment;
        if (typeof seg === "string" && seg.trim()) return seg.trim();
      } catch { /* stdout is not JSON — no statusSegment */ }
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
  opts: HookRunOpts & { toolName?: string; matcherValue?: string; isError?: boolean; prompt?: string; sessionType?: MatchContext["sessionType"]; maintenance?: boolean } = {},
): Promise<void> {
  try {
    const matchCtx: MatchContext = { toolName: opts.toolName, matcherValue: opts.matcherValue, isError: opts.isError, prompt: opts.prompt, sessionType: opts.sessionType, maintenance: opts.maintenance };
    const hooks = matchingHooks(await loadShellHooks(dataDir), event, matchCtx);
    if (!hooks.length) return;
    const ctx = JSON.stringify({ event, ...context });
    await Promise.all(hooks.map((h: ShellHook) => runHook(h, event, ctx, opts)));
  } catch {
    // best-effort — a non-blocking hook must never affect the session
  }
}
