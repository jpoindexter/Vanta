// Pure, immutable model for fish/zsh-autosuggest-style inline ghost-text completion
// from prior input history. No Ink/React, no fs, no clock — the caller supplies the
// typed prefix and the prior inputs (session input history and/or imported shell
// history). The suggest-pick, the accept, and the display split are unit-tested in
// isolation (ghost-complete.test.ts). Companion to ui/history-picker.ts (the ^R
// overlay): the picker is an explicit list; this is the always-on inline suffix.
//
// WIRING (not done this round, named for the clarity gate): ui/composer.tsx already
// renders a `ghost` suffix (currently from composer-keys.ts `historyTypeahead`).
// To adopt this module, line 49 of composer.tsx would compute the ghost via
// `suggestGhost(value, props.history)` (same gating: no palette open, not mid
// history-nav, cursor at end of value); ComposerView passes `ghost` to CursorText,
// which renders `<Text dimColor>{ghost}</Text>` after the buffer (composer-view.tsx
// line 78 — the dim ghost marker). The →/End accept lives in composer.tsx
// `handleGhostAccept` (line 138): on rightArrow with a non-empty ghost it would call
// `setBuf(acceptGhost(value, ghost), …)` to commit the full text. `formatGhost` is the
// pure display split (input vs ghost portion) that view layer or tests assert against.
//
// Policy:
//   - History is newest-LAST (most-recent = highest index), matching the session
//     history convention used by composer-keys.ts. We scan from the end so the
//     most-recent matching entry wins.
//   - The prefix match is CASE-SENSITIVE (`startsWith`), matching historyTypeahead.
//   - Empty/whitespace-only typed input → no ghost (autosuggest stays silent until
//     the operator commits to a prefix; mirrors history-picker's empty-query handling
//     being a distinct overlay concern, not an inline one).
//   - A multi-line typed prefix → no ghost (the composer ghost only completes the
//     current single line).
//   - An entry equal to the input (after sanitize) → no ghost (nothing to add).
//   - The candidate is control-stripped BEFORE the prefix test + slice, so a history
//     entry can never inject a terminal escape into the rendered ghost line.

// C0/C1 control bytes + DEL, written with explicit \u code points so this source file
// carries NO literal control bytes. Stripped from any history candidate before it is
// matched or sliced (same threat model as history-picker.ts / spinner-verbs.ts).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/** Remove control/escape bytes (keeps spaces — a ghost must preserve literal spacing). */
function stripControl(text: string): string {
  return text.replace(CONTROL_CHARS, "");
}

/**
 * The ghost SUFFIX to show after `input`: the most-recent history entry that
 * `startsWith(input)` and is strictly longer than `input`, minus the `input` prefix.
 *
 * Returns "" (no ghost) when: `input` is empty/whitespace-only, `input` spans
 * multiple lines, no entry starts with `input`, or the only match equals `input`
 * exactly (nothing to add). Each candidate is control-stripped before matching, so
 * the returned suffix is escape-free.
 */
export function suggestGhost(input: string, history: readonly string[]): string {
  if (input.trim() === "" || input.includes("\n")) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry === undefined) continue;
    const clean = stripControl(entry);
    if (clean.length > input.length && clean.startsWith(input)) return clean.slice(input.length);
  }
  return "";
}

/** The accepted full text: the typed input with the ghost suffix appended. */
export function acceptGhost(input: string, ghost: string): string {
  return input + ghost;
}

/** The display split: the typed `input` and the dim-rendered `ghost` portion. The
 *  view renders `input` normally and `ghost` as a dim `<Text>` immediately after. */
export type GhostDisplay = { readonly input: string; readonly ghost: string };

/** Separate the typed input from the ghost suffix for display (input bright, ghost dim). */
export function formatGhost(input: string, ghost: string): GhostDisplay {
  return { input, ghost };
}
