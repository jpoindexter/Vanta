// TUI-COMPOSER-TYPEAHEAD — pure fish-shell-style history typeahead (ghost text).
//
// As the operator types in the composer, the most-recent matching history entry is
// suggested as dim "ghost text" after the cursor; Right/End/Ctrl+F accepts it. This
// module is the PURE model behind that: input + history → the ghost completion, and
// the accept. No Ink/React, no fs, no clock — the caller supplies the typed input and
// the prior inputs (newest-LAST, the session-history convention used everywhere in the
// composer). Fully unit-tested in isolation (history-ghost.test.ts).
//
// SECURITY (this slice's fix): the ghost is rendered into the LIVE terminal, after the
// cursor. A history entry can carry pasted control/ANSI bytes; if those reached the
// terminal as ghost text they could inject terminal control. So every candidate is
// CONTROL-STRIPPED (reusing bash-io's stripToLine — the same ANSI+C0/C1+DEL strip that
// hardens shell-tool rendering) BEFORE the prefix test + slice, so the returned ghost
// is escape-free. The existing composer-keys.ts `historyTypeahead` does NOT strip — this
// module is the hardened replacement for it (see WIRING below).
//
// WIRING (named for the clarity gate, NOT done this round): ui/composer.tsx currently
// computes its ghost suffix from composer-keys.ts `historyTypeahead(history, buffer)`
// (un-stripped — the gap). To adopt this hardened model, composer.tsx would compute the
// ghost via `ghostSuggestion(buffer, history)` (same gating: composer focused, no
// palette open, not mid history-nav, cursor at end of the buffer); ComposerView passes
// it to CursorText which renders `<Text dimColor>{ghost}</Text>` after the buffer (the
// dim ghost marker in composer-view.tsx). The Right/End/Ctrl+F accept (composer.tsx
// ghost-accept handler) would call `setBuf(acceptGhost(buffer, history), …)` to commit
// the full completed line. `ghostVisible(buffer, history)` gates whether the accept key
// is live at all. This REPLACES the un-stripped `historyTypeahead` call site.
//
// Policy:
//   - History is newest-LAST; we scan from the end so the MOST-RECENT match wins.
//   - The prefix match is CASE-SENSITIVE (`startsWith`), matching historyTypeahead.
//   - Empty input → no ghost. Multi-line input → no ghost (the composer ghost only
//     completes the current single line).
//   - input === the (stripped) full entry → no ghost (nothing to add).
//   - Each candidate is control-stripped before the prefix test + slice, so the ghost
//     can never carry a terminal escape.

import { stripToLine } from "../term/bash-io.js";

/**
 * The ghost completion to show after `input`: the REMAINDER of the most-recent history
 * entry that `startsWith(input)` and is strictly longer than `input`, after the typed
 * prefix is removed. The candidate is control-stripped (ANSI + C0/C1 + DEL) before the
 * match and slice, so the returned remainder is escape-free.
 *
 * Returns "" (no ghost) when: `input` is empty, `input` spans multiple lines, no entry
 * starts with `input`, or the only match equals `input` exactly (nothing to add).
 */
export function ghostSuggestion(input: string, history: readonly string[]): string {
  if (input === "" || input.includes("\n")) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry === undefined) continue;
    const clean = stripToLine(entry);
    if (clean.length > input.length && clean.startsWith(input)) return clean.slice(input.length);
  }
  return "";
}

/**
 * The full completed line when the operator accepts the ghost: `input` with the ghost
 * remainder appended. When there is no ghost (empty/no-match/exact), returns `input`
 * unchanged — accepting a non-existent ghost is a no-op.
 */
export function acceptGhost(input: string, history: readonly string[]): string {
  return input + ghostSuggestion(input, history);
}

/** True when a non-empty ghost exists for `input` (gates the accept key + dim render). */
export function ghostVisible(input: string, history: readonly string[]): boolean {
  return ghostSuggestion(input, history) !== "";
}
