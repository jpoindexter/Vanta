import {
  loadShellHooks,
  matchingHooks,
  type ShellHookEvent,
  type ShellHook,
  type MatchContext,
} from "./shell-hooks.js";
import { resolvePostToolBlock } from "./continue-on-block.js";
import { interpretHookExit } from "./hook-exit-codes.js";
import { runHook, type HookRunOpts } from "./hook-run-core.js";

// Hook execution layer. Extracted from shell-hooks.ts (size gate).
// Types, schemas, and match logic stay in shell-hooks.ts. The child-process
// spawn machinery lives in hook-spawn.ts; the single-hook engine (runHook /
// runOneHook + timeout/once/progress) lives in hook-run-core.ts. This file is
// the per-event batch firers over that engine. runShellHook/runExecHook,
// runOneHook, and the shared types are re-exported so external callers stay
// unchanged.

export { runShellHook, runExecHook } from "./hook-spawn.js";
export { runOneHook } from "./hook-run-core.js";
export type { ShellHookResult, HookRunDeps } from "./hook-run-core.js";

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
