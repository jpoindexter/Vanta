// Pure kill-buffer (kill/yank) state machine for the composer's Ctrl+U / Ctrl+Y.
// No Ink/React — unit-testable in isolation (kill-yank.test.ts). Distinct from
// the param-style `yank` in composer-edits.ts: here the killed text is carried in
// an explicit, immutable `KillYankState` so the buffer transitions are self-
// contained. Every transform returns a NEW state object — the input is never
// mutated.
//
// Wiring (NOT applied this round — clarity gate): in ui/composer.tsx the killRef
// would hold a `KillYankState` instead of a bare string, and in
// composer-keys.ts' TABLE the `^U` entry would call `killWholeLine` (replacing
// the current `killToStart` kill-to-start behavior — a DELIBERATE behavior
// change: ^U now clears the WHOLE line) and the `^Y` entry would call `yank`,
// both threading the state through `applyEdit`.

/** The kill-buffer: holds the most recently killed text (empty = nothing to yank). */
export type KillYankState = { killBuffer: string };

/** A buffer/cursor edit that also advances the kill-buffer state. */
export type KillResult = { buffer: string; cursor: number; state: KillYankState };

/** A buffer/cursor edit that reads (but does not change) the kill-buffer. */
export type YankResult = { buffer: string; cursor: number };

/** The empty kill-buffer — nothing killed yet. */
export const EMPTY_KILL: KillYankState = { killBuffer: "" };

/**
 * Ctrl+U — clear the WHOLE input line into the kill-buffer.
 * The entire old buffer is saved to `killBuffer` (replacing any prior kill),
 * the buffer is emptied, and the cursor moves to 0. `cursor` is accepted for a
 * uniform edit-op signature; clearing all makes its value irrelevant.
 * Never mutates the input state.
 */
export function killWholeLine(buffer: string, _cursor: number, _state: KillYankState): KillResult {
  return { buffer: "", cursor: 0, state: { killBuffer: buffer } };
}

/**
 * Ctrl+Y — yank: insert the kill-buffer at the cursor and advance past it.
 * A no-op (buffer/cursor unchanged) when the kill-buffer is empty. Clamps an
 * out-of-range cursor into [0, buffer.length]. Never mutates the input state.
 */
export function yank(buffer: string, cursor: number, state: KillYankState): YankResult {
  const c = Math.max(0, Math.min(cursor, buffer.length));
  const killed = state.killBuffer;
  if (killed === "") return { buffer, cursor: c };
  return { buffer: buffer.slice(0, c) + killed + buffer.slice(c), cursor: c + killed.length };
}
