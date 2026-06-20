import type { ShellHook } from "./shell-hooks.js";

// PURE — no I/O. Decides what a PostToolUse hook BLOCK should do.
//
// Today a PostToolUse hook block hard-stops the turn (the tool result becomes a
// blocked outcome and the model gets no chance to adapt). With `continueOnBlock`
// the rejection reason is fed BACK to the model — surfaced on the tool result /
// as a system note — so it can adapt and continue instead of the turn ending.
//
// Without the flag, behavior is unchanged: a block is a hard stop.

export type PostToolBlockResolution = {
  /** True → end the turn (current behavior). False → continue; the model sees `feedback`. */
  hardStop: boolean;
  /** The rejection reason fed back to the model. Present only when continuing. */
  feedback?: string;
};

/**
 * Resolve a PostToolUse hook block.
 *
 * - `hook.continueOnBlock === true` → `{ hardStop: false, feedback: <reason> }`:
 *   the reason is fed back to the model and the turn continues. An empty/blank
 *   reason still continues, carrying no feedback (the field is omitted rather
 *   than an empty string).
 * - otherwise → `{ hardStop: true }`: the block hard-stops the turn, exactly as
 *   it does today (no feedback).
 */
export function resolvePostToolBlock(hook: ShellHook, reason: string): PostToolBlockResolution {
  if (hook.continueOnBlock !== true) return { hardStop: true };
  const trimmed = reason.trim();
  return trimmed ? { hardStop: false, feedback: trimmed } : { hardStop: false };
}
