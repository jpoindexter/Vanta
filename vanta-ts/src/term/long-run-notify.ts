// VANTA-OS-NOTIFY — when a single tool run takes longer than a threshold AND the
// terminal is not focused/active, fire an OS desktop notification ("Vanta
// finished — <task>") so the operator notices a long job completing while their
// attention is elsewhere. A fast run, an active/focused terminal, or the feature
// disabled = no notification (current behavior, unchanged).
//
// Pure decision + injectable notifier (same shape as away-summary.ts): every
// clock value is folded into `elapsedMs` by the caller and the notifier is
// injected, so the decision is deterministic and no real OS notification fires
// in tests. This REUSES term/notify.ts's `notify()` as the send mechanism — it
// does NOT write a new notifier.
//
// WIRING (deliberately NOT live this round; a real terminal-focus signal is a
// live boundary). The realistic trigger is the POST-TOOL point in the agent loop
// — `agent.ts dispatchTool` (mirroring where clarity-gate / EF-SELFMONITOR
// already hook per-tool). After a tool's `execute` resolves, the loop knows the
// run's elapsed time; it would read a `terminalActive` signal (the inverse of
// the "away" notion already stamped each turn via proactive `recordActivity` /
// `markProactiveActivity` in repl/post-turn-gates.ts — terminal focus is active
// recently ⇒ active) and call `maybeNotifyLongRun({ elapsedMs, terminalActive,
// env }, { notify, taskLabel })`, passing the real `notify` from term/notify.ts
// and the task/tool label. Until that focus signal is live, this ships the pure
// decision + the injected-notifier path, fully unit-tested.

import { z } from "zod";
import { notify as realNotify } from "./notify.js";

/** Default: only notify for runs at least this long (the operator has likely looked away). */
export const DEFAULT_NOTIFY_AFTER_MS = 30_000;

const InputSchema = z.object({
  /** How long the tool run took, in ms. Negative is treated as 0 (never long enough). */
  elapsedMs: z.number(),
  /** Whether the terminal is currently focused/active. Active ⇒ never notify. */
  terminalActive: z.boolean(),
  /** Process env — read for the threshold + disable flag. */
  env: z.record(z.string(), z.string().optional()),
});
export type LongRunNotifyInput = z.infer<typeof InputSchema>;

/** The OS notification payload `notify()` sends. */
export type LongRunNotice = { title: string; body: string };

/** A `notify()`-shaped sender so the real OS notifier can be injected (and stubbed in tests). */
export type NotifyFn = (opts: {
  title: string;
  message: string;
  env?: NodeJS.ProcessEnv;
  notificationType?: string;
}) => void;

export type MaybeNotifyDeps = {
  /** The OS-notification sender. Defaults to term/notify.ts's `notify` (the REUSED mechanism). */
  notify?: NotifyFn;
  /** The task/tool label woven into the notification body. */
  taskLabel: string;
  /** The env the notice is sent with (forwarded to `notify` so VANTA_NOTIFY etc. apply). */
  env?: NodeJS.ProcessEnv;
};

/**
 * Resolve the "notify after" threshold from the environment. `VANTA_NOTIFY_AFTER_MS`
 * overrides; an invalid / unset / negative value falls back to the 30s default. Pure.
 */
export function resolveNotifyAfterMs(env: NodeJS.ProcessEnv): number {
  const value = env.VANTA_NOTIFY_AFTER_MS;
  if (value === undefined || value.trim() === "") return DEFAULT_NOTIFY_AFTER_MS;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_NOTIFY_AFTER_MS;
  return raw;
}

/** True when `VANTA_OS_NOTIFY=0` (or `false`) explicitly disables the long-run notice. Pure. */
export function isLongRunNotifyDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.VANTA_OS_NOTIFY;
  return value === "0" || value === "false";
}

/**
 * Decide whether a long-run OS notification should fire: the run elapsed past the
 * threshold AND the terminal is NOT active AND the feature is not disabled. A fast
 * run, an active terminal, or `VANTA_OS_NOTIFY=0` ⇒ false. Pure, errors-as-values
 * (invalid input ⇒ false, never throws).
 */
export function shouldNotifyLongRun(input: LongRunNotifyInput): boolean {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return false;
  const { elapsedMs, terminalActive, env } = parsed.data;
  if (terminalActive) return false;
  if (isLongRunNotifyDisabled(env)) return false;
  return elapsedMs >= resolveNotifyAfterMs(env);
}

/** Build the OS notification for a finished long run. Pure. */
export function buildLongRunNotice(taskLabel: string): LongRunNotice {
  const label = taskLabel.trim();
  return { title: "Vanta finished", body: label ? `Vanta finished — ${label}` : "Vanta finished" };
}

/**
 * Fire the long-run OS notification when {@link shouldNotifyLongRun} says so, else
 * no-op. Best-effort: a notifier failure is swallowed (never throws across the
 * boundary). Returns true iff a notification was attempted.
 */
export function maybeNotifyLongRun(input: LongRunNotifyInput, deps: MaybeNotifyDeps): boolean {
  if (!shouldNotifyLongRun(input)) return false;
  const send = deps.notify ?? realNotify;
  const notice = buildLongRunNotice(deps.taskLabel);
  try {
    send({ title: notice.title, message: notice.body, env: deps.env, notificationType: "long_run" });
    return true;
  } catch {
    return false;
  }
}
