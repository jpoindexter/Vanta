import {
  loadShellHooks,
  matchingHooks,
  type ShellHookEvent,
  type ShellHook,
  type MatchContext,
} from "./shell-hooks.js";
import { resolveHookExec } from "./hook-exec-form.js";
import { resolvePostToolBlock } from "./continue-on-block.js";
import { runMcpToolHook } from "./mcp-hook-run.js";
import { runHttpHook } from "./http-hook-run.js";
import { runPromptHook } from "./prompt-hook-run.js";
import { interpretHookExit } from "./hook-exit-codes.js";
import { shouldShowTiming, buildHookTimingNote } from "./hook-timing.js";
import { resolveHookProgressMs, buildHookProgressNote, buildHookProgressDone } from "./hook-progress.js";
import { DEFAULT_TIMEOUT_MS, runShellHook, runExecHook } from "./hook-spawn.js";
import type { LLMProvider } from "../providers/interface.js";

// Hook execution layer. Extracted from shell-hooks.ts (size gate).
// Types, schemas, and match logic stay in shell-hooks.ts. The child-process
// spawn machinery lives in hook-spawn.ts; runShellHook/runExecHook are
// re-exported here so external callers stay unchanged.

export { runShellHook, runExecHook } from "./hook-spawn.js";

const ONCE_KEYS = new Set<string>();

export type HookRunDeps = {
  promptProvider?: LLMProvider;
  runAgentHook?: (hook: ShellHook, contextJson: string) => Promise<ShellHookResult>;
  onStatus?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
};

type HookRunOpts = HookRunDeps & { cwd?: string };

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
async function runHook(hook: ShellHook, event: ShellHookEvent, contextJson: string, opts: HookRunOpts): Promise<ShellHookResult> {
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

export type ShellHookResult = { code: number; stdout: string; stderr: string };

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

export type PreToolUseOutcome = {
  /** True only when a hook exited 2 — the tool must not run. */
  blocked: boolean;
  /** For a blocked tool: the hook's stderr, fed back TO THE MODEL as the block reason. */
  reason?: string;
  /** For a non-blocking, non-zero hook (any code except 0 and 2): stderr surfaced TO THE USER. */
  userMessage?: string;
};

/**
 * Run the PreToolUse hooks for a tool, routing each hook's exit code through
 * `interpretHookExit`: exit 0 = silent/allow, exit 2 = BLOCK (stderr → model),
 * any other non-zero = non-blocking (stderr → user). The first blocking hook
 * stops the chain; otherwise the first non-blocking user message is carried up.
 * No matching hooks → allowed.
 */
export async function firePreToolUse(
  dataDir: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: HookRunOpts & { sessionType?: MatchContext["sessionType"] } = {},
): Promise<PreToolUseOutcome> {
  const matchCtx: MatchContext = { toolName, matcherValue: toolName, toolInputJson: JSON.stringify(args), sessionType: opts.sessionType };
  const hooks = matchingHooks(await loadShellHooks(dataDir), "PreToolUse", matchCtx);
  if (!hooks.length) return { blocked: false };
  const ctx = JSON.stringify({ event: "PreToolUse", tool: toolName, args });
  let userMessage: string | undefined;
  for (const h of hooks) {
    const r = await runHook(h, "PreToolUse", ctx, opts);
    const verdict = interpretHookExit(r.code, r.stdout, r.stderr);
    if (verdict.block) {
      return { blocked: true, reason: verdict.toModel ?? (r.stdout.trim() || `PreToolUse hook exited ${r.code}`) };
    }
    if (verdict.toUser && !userMessage) userMessage = verdict.toUser;
  }
  return userMessage ? { blocked: false, userMessage } : { blocked: false };
}

export type PostToolUseOutcome = {
  /** True only when a hook blocked (exit 2) WITHOUT `continueOnBlock` — hard-stop the turn. */
  hardStop: boolean;
  /** A blocking hook's reason fed BACK to the model (continueOnBlock) — appended to the tool result. */
  feedback?: string;
};

/**
 * Run PostToolUse hooks AFTER a tool executed. A block (exit 2) is resolved by
 * `resolvePostToolBlock`: `continueOnBlock` returns the reason as `feedback`
 * (turn continues); otherwise `hardStop: true` (block ends the turn, as today).
 * First hard-stop ends the chain; feedback otherwise accumulates. No blocking
 * hook → `{ hardStop: false }` (byte-identical to the prior path). Never throws.
 */
export async function firePostToolUse(
  dataDir: string,
  context: Record<string, unknown>,
  opts: HookRunOpts & { toolName?: string; matcherValue?: string; isError?: boolean } = {},
): Promise<PostToolUseOutcome> {
  try {
    const matchCtx: MatchContext = { toolName: opts.toolName, matcherValue: opts.matcherValue, isError: opts.isError };
    const hooks = matchingHooks(await loadShellHooks(dataDir), "PostToolUse", matchCtx);
    if (!hooks.length) return { hardStop: false };
    const ctx = JSON.stringify({ event: "PostToolUse", ...context });
    const feedback: string[] = [];
    for (const h of hooks) {
      const r = await runHook(h, "PostToolUse", ctx, opts);
      const verdict = interpretHookExit(r.code, r.stdout, r.stderr);
      if (!verdict.block) continue;
      const reason = verdict.toModel ?? (r.stdout.trim() || `PostToolUse hook exited ${r.code}`);
      const resolution = resolvePostToolBlock(h, reason);
      if (resolution.hardStop) return { hardStop: true, feedback: reason };
      if (resolution.feedback) feedback.push(resolution.feedback);
    }
    return feedback.length ? { hardStop: false, feedback: feedback.join("\n") } : { hardStop: false };
  } catch {
    return { hardStop: false };
  }
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
