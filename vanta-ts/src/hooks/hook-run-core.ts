import { resolveHookExec } from "./hook-exec-form.js";
import { runMcpToolHook } from "./mcp-hook-run.js";
import { runHttpHook } from "./http-hook-run.js";
import { runPromptHook } from "./prompt-hook-run.js";
import { shouldShowTiming, buildHookTimingNote } from "./hook-timing.js";
import { resolveHookProgressMs, buildHookProgressNote, buildHookProgressDone } from "./hook-progress.js";
import { DEFAULT_TIMEOUT_MS, runShellHook, runExecHook } from "./hook-spawn.js";
import type { ShellHookEvent, ShellHook } from "./shell-hooks.js";
import type { LLMProvider } from "../providers/interface.js";

// Single-hook execution engine. Extracted from shell-hook-run.ts (size gate):
// the per-event batch firers stay there and call `runHook` from here. This module
// is a leaf (it imports the type adapters; nothing here imports the firers), so
// there's no value cycle.

const ONCE_KEYS = new Set<string>();

export type HookRunDeps = {
  promptProvider?: LLMProvider;
  runAgentHook?: (hook: ShellHook, contextJson: string) => Promise<ShellHookResult>;
  onStatus?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
};

export type HookRunOpts = HookRunDeps & { cwd?: string };

export type ShellHookResult = { code: number; stdout: string; stderr: string };

/** A human-readable label for a hook in a timing note: `<event>:<type>`. */
function hookLabel(hook: ShellHook, event: ShellHookEvent): string {
  return `${event}:${hook.type ?? "shell"}`;
}

type ProgressArm = { cancel: () => void; shown: () => boolean };

/**
 * Arm a one-shot in-progress indicator: after `resolveHookProgressMs(env)` ms a
 * still-running hook surfaces its progress note ONCE (sets a shown flag).
 * `cancel()` clears the timer (always safe to call, even after it fired) so the
 * timer can never leak and never delays the hook — it is observational only.
 * An instant hook (resolves before the threshold) is cancelled first and emits
 * nothing.
 */
function armProgress(hook: ShellHook, event: ShellHookEvent, opts: HookRunOpts): ProgressArm {
  let shown = false;
  const timer = setTimeout(() => {
    shown = true;
    opts.onStatus?.(buildHookProgressNote(event, hook.type ?? "shell"));
  }, resolveHookProgressMs(opts.env));
  return { cancel: () => clearTimeout(timer), shown: () => shown };
}

/**
 * Public single-hook runner: dispatch one already-matched hook through its
 * configured type adapter with the same timeout/once/status semantics as the
 * batch firers. Used by the SessionStart deferral path so an inline and a
 * deferred hook run through the identical pipeline.
 */
export function runOneHook(hook: ShellHook, event: ShellHookEvent, contextJson: string, opts: HookRunDeps & { cwd?: string } = {}): Promise<ShellHookResult> {
  return runHook(hook, event, contextJson, opts);
}

/** Dispatch one hook to its configured type adapter. */
export async function runHook(hook: ShellHook, event: ShellHookEvent, contextJson: string, opts: HookRunOpts): Promise<ShellHookResult> {
  if (hook.once && seenOnce(event, hook)) return { code: 0, stdout: "[hook skipped: once]", stderr: "" };
  if (hook.statusMessage) opts.onStatus?.(hook.statusMessage);
  const startedAt = Date.now();
  const progress = armProgress(hook, event, opts);
  const result = await withHookTimeout(runHookNow(hook, contextJson, opts), hook.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  progress.cancel();
  // Observational only: surface a one-line indicator past each threshold; never
  // affects the result that flows back to the caller. An instant hook (under the
  // progress threshold) emits no progress line — its timer was cancelled first.
  const elapsed = Date.now() - startedAt;
  if (progress.shown()) opts.onStatus?.(buildHookProgressDone(event, hook.type ?? "shell", elapsed));
  if (shouldShowTiming(elapsed)) opts.onStatus?.(buildHookTimingNote(hookLabel(hook, event), elapsed));
  return result;
}

function runHookNow(hook: ShellHook, contextJson: string, opts: HookRunOpts): Promise<ShellHookResult> {
  const type = hook.type ?? "shell";
  if (type === "mcp_tool") return runMcpToolHook(hook, contextJson, opts);
  if (type === "http") return runHttpHook(hook, contextJson, { env: opts.env, timeoutMs: hook.timeoutMs });
  if (type === "prompt") return runPromptHook(hook, contextJson, { provider: opts.promptProvider });
  if (type === "agent") return opts.runAgentHook ? opts.runAgentHook(hook, contextJson) : Promise.resolve({ code: 1, stdout: "", stderr: "agent hook requires agent deps" });
  const exec = resolveHookExec(hook);
  if (exec.form === "error") return Promise.resolve({ code: 1, stdout: "", stderr: exec.reason });
  const spawnOpts = { cwd: opts.cwd, timeoutMs: hook.timeoutMs };
  if (exec.form === "exec") return runExecHook(exec.file, exec.args, contextJson, spawnOpts);
  return runShellHook(exec.command, contextJson, spawnOpts);
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
