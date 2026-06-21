// MSG-TYPING-HEARTBEAT — a pure heartbeat state machine for the messaging-channel
// "typing…" indicator. While Vanta is composing a reply over a channel (Telegram
// etc.) it should periodically signal liveness so the human knows it's working —
// BUT it must PAUSE that signal while an approval prompt is pending, because a
// "typing" indicator while Vanta is actually blocked on a human decision is a lie
// (it's waiting, not typing). This module owns only the WHEN — pure, immutable,
// zero I/O, zero platform knowledge. The live `sendTyping` call is the boundary
// (injected by the caller); this decides whether the next tick should send.
//
// Wiring (NOT done this round — named for the next slice, mirrors clarity-gate):
//   In `gateway/run.ts pollPlatform`/`runOne`, when it begins composing a reply
//   (before `ctx.handle(...)`):
//     • `startTyping(now())` → an active state, send the first tick immediately;
//     • on a timer (~every `intervalMs`), call `nextTypingTick(state, now())` and
//       when `shouldSend`, call a NEW optional `PlatformAdapter.sendTyping(chatId)`
//       (Telegram: `sendChatAction` action "typing"); thread the returned state;
//     • around an approval prompt (`ctx.requestApproval`), wrap with
//       `pauseTypingForApproval(state)` before and `resumeTypingAfterApproval(state)`
//       after — so the channel shows nothing while blocked on the human;
//     • `stopTyping(state)` once the reply is sent.
//   `typingHeartbeatEnabled(env)` gates the whole thing (default ON).

/** Immutable heartbeat state. `lastSentMs` is the clock value of the last sent tick (0 = none yet). */
export type TypingState = {
  /** True while Vanta is composing a reply on the channel (between start and stop). */
  readonly active: boolean;
  /** True while an approval prompt is pending — suppresses ticks even when active. */
  readonly pausedForApproval: boolean;
  /** The `nowMs` of the last sent tick; 0 before the first send. */
  readonly lastSentMs: number;
};

/** The default tick interval. Telegram's typing action expires after ~6s, so re-send under that. */
export const DEFAULT_TYPING_INTERVAL_MS = 5000;

/**
 * Begin a typing session: an active, un-paused state whose `lastSentMs` is set to
 * `nowMs` so the FIRST `nextTypingTick` waits one full interval before re-sending.
 * The caller sends the opening tick itself at start; the heartbeat covers re-sends.
 * Pure.
 */
export function startTyping(nowMs: number): TypingState {
  return { active: true, pausedForApproval: false, lastSentMs: nowMs };
}

/** Stop the typing session — inactive, pause cleared. Idempotent. Pure, immutable. */
export function stopTyping(state: TypingState): TypingState {
  return { active: false, pausedForApproval: false, lastSentMs: state.lastSentMs };
}

/**
 * Mark an approval prompt as pending — the key behavior: while paused, no typing
 * tick is sent (Vanta is blocked on the human, not composing). Leaves `active` and
 * `lastSentMs` untouched so resume continues the same session. Pure, immutable.
 */
export function pauseTypingForApproval(state: TypingState): TypingState {
  return { ...state, pausedForApproval: true };
}

/** Clear the approval pause so ticks resume on the next interval. Pure, immutable. */
export function resumeTypingAfterApproval(state: TypingState): TypingState {
  return { ...state, pausedForApproval: false };
}

/** Result of evaluating one tick: the (possibly updated) state + whether to send now. */
export type TickResult = {
  readonly state: TypingState;
  /** True only when active AND not paused AND the interval has elapsed. */
  readonly shouldSend: boolean;
};

/**
 * Evaluate whether to send the next typing tick at `nowMs`. Sends only when the
 * session is active, NOT paused for an approval, and at least `intervalMs` has
 * elapsed since the last sent tick. On a send, `lastSentMs` advances to `nowMs`;
 * otherwise the state is returned unchanged (nothing is sent). Pure — the caller
 * performs the actual `sendTyping` when `shouldSend` is true.
 */
export function nextTypingTick(
  state: TypingState,
  nowMs: number,
  intervalMs: number = DEFAULT_TYPING_INTERVAL_MS,
): TickResult {
  const elapsed = nowMs - state.lastSentMs;
  const shouldSend = state.active && !state.pausedForApproval && elapsed >= intervalMs;
  if (!shouldSend) return { state, shouldSend: false };
  return { state: { ...state, lastSentMs: nowMs }, shouldSend: true };
}

/**
 * Whether the typing-indicator heartbeat is enabled. Default ON;
 * `VANTA_TYPING_INDICATOR=0` (or `false`) disables it. Pure.
 */
export function typingHeartbeatEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.VANTA_TYPING_INDICATOR ?? "").trim().toLowerCase();
  return raw !== "0" && raw !== "false";
}
