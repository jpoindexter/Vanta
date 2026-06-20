import { GLYPHS } from "../term/figures.js";

// VANTA-THINKING-TOGGLE — pure expand/collapse model + formatting for the
// model's reasoning ("thinking") text in the transcript. Default state is
// "collapsed" so a transcript stays clean; the operator can expand to the full
// reasoning. This module owns the state model and the collapsed-summary string
// only — it does NOT render Ink rows or read keys (see WIRING below).
//
// WIRING (named, not done this round — mirrors the clarity gate):
//   • Render seam: ui/transcript.tsx `ThinkingView` (the `<Text>✻ thinking</Text>`
//     row + its truncated body) is where `renderThinking(text, display)` would
//     replace the hard-coded preview — collapsed → one summary line, expanded →
//     the full text. An `Entry` of kind "thinking" would carry the per-row
//     `ThinkingDisplay` (default from `defaultThinkingDisplay(process.env)`).
//   • Keybinding seam: ui/shortcuts.ts (DEFAULT_BINDINGS, transcript context)
//     would register a chord whose handler calls `toggleThinking(state)` on the
//     focused thinking row and commits the flipped state back to the reducer.

/** Per-row reasoning display state: collapsed to a summary, or expanded to full. */
export type ThinkingDisplay = "collapsed" | "expanded";

const EXPANDED_ENV = "VANTA_THINKING_EXPANDED";

/** Count of non-empty (trimmed) lines — mirrors ThinkingView's `.filter(Boolean)`. */
function nonEmptyLineCount(thinkingText: string): number {
  return thinkingText.split("\n").filter((l) => l.trim().length > 0).length;
}

/**
 * Default display state read from env. Collapsed (clean transcript) unless
 * `VANTA_THINKING_EXPANDED=1` opts into showing full reasoning by default.
 */
export function defaultThinkingDisplay(env: NodeJS.ProcessEnv = process.env): ThinkingDisplay {
  return (env[EXPANDED_ENV] ?? "").trim() === "1" ? "expanded" : "collapsed";
}

/** The flipped display state. Pure. */
export function toggleThinking(state: ThinkingDisplay): ThinkingDisplay {
  return state === "collapsed" ? "expanded" : "collapsed";
}

/**
 * The one-line collapsed summary. Counts non-empty lines:
 *   • 0 lines (empty thinking) → "" (no row)
 *   • 1 line  → "✻ thinking (collapsed)"
 *   • N lines → "✻ thinking (collapsed — N lines)"
 */
export function collapsedThinkingSummary(thinkingText: string): string {
  const n = nonEmptyLineCount(thinkingText);
  if (n === 0) return "";
  const label = `${GLYPHS.asterisk} thinking (collapsed`;
  return n === 1 ? `${label})` : `${label} — ${n} lines)`;
}

/**
 * Render thinking text for the given display state: the collapsed summary when
 * "collapsed", the full text when "expanded". Empty thinking → "" (no row) in
 * either state, so the default collapsed transcript stays clean.
 */
export function renderThinking(thinkingText: string, display: ThinkingDisplay): string {
  if (nonEmptyLineCount(thinkingText) === 0) return "";
  return display === "collapsed" ? collapsedThinkingSummary(thinkingText) : thinkingText;
}
