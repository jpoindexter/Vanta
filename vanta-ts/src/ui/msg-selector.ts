// VANTA-MSG-SELECTOR — pure, immutable selection model for picking transcript
// messages (one index, or an inclusive range) and exporting their combined text as
// a clean copyable block with role prefixes. No Ink/React, no fs, no clipboard — the
// caller supplies the `Message[]`. Selection-state transitions + the export are
// unit-tested in isolation (msg-selector.test.ts). Mirrors the move/clamp style of
// ui/history-picker.ts (no-wrap clamp, immutable `{...state}` returns).
//
// WIRING (not done this round, named for the clarity gate): a transcript-select
// overlay component (sibling of ui/transcript.tsx) would open this with
// `openSelector(messages.length)` on a chord; ↑/↓ drive `moveCursor`, a key (e.g.
// `v`, the vim visual-mode convention) calls `toggleAnchor` to start/clear a range,
// and the overlay renders `formatSelector(messages, state)`. On confirm the host
// calls `exportSelection(messages, selectedIndices(state))` and pipes the text to the
// SAME clipboard path `/copy` uses (the `pbcopy` spawn in repl/media-cmds.ts), so
// selecting a range and copying it reuses the existing copy action end-to-end.

import type { Message } from "../types.js";

/** The selector's full immutable state. `cursor` = the focused row; `anchor` is set while range-selecting (else null). */
export type SelectorState = {
  readonly count: number;
  readonly cursor: number;
  readonly anchor: number | null;
};

const CURSOR_MARK = "▸ ";
const PLAIN_MARK = "  ";
const SELECTED_MARK = "✓";
const UNSELECTED_MARK = " ";

// ANSI escape sequences (OSC, CSI, and any other bare ESC) plus the C0/C1 control
// ranges, written with explicit \u code points so the source carries NO literal
// control bytes. Stripping these stops a message from injecting terminal escapes
// into the exported block or the rendered overlay (same threat model as
// ui/history-picker.ts).
const ANSI_ESCAPE = new RegExp("\\u001b(?:\\][\\s\\S]*?(?:\\u0007|\\u001b\\\\)|\\[[0-9;?]*[ -/]*[@-~]|.)", "g");
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/** Strip ANSI escapes + control chars (newlines/tabs → space), collapse whitespace runs, trim. */
function controlStrip(text: string): string {
  return text
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clamp `value` into `[0, max]` (no wrap). `max < 0` (empty list) → 0. */
function clamp(value: number, max: number): number {
  if (max < 0) return 0;
  return Math.max(0, Math.min(max, value));
}

/** Open the selector over `count` messages: cursor at row 0, no range anchor. */
export function openSelector(count: number): SelectorState {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { count: safeCount, cursor: 0, anchor: null };
}

/** Move the cursor by `delta` (-1 up / +1 down), clamped to `[0, count-1]` (no wrap). */
export function moveCursor(state: SelectorState, delta: number): SelectorState {
  const next = clamp(state.cursor + delta, state.count - 1);
  return { ...state, cursor: next };
}

/** Start a range anchor at the cursor; if one is already set, clear it (toggle back to single-select). */
export function toggleAnchor(state: SelectorState): SelectorState {
  if (state.count === 0) return { ...state, anchor: null };
  return { ...state, anchor: state.anchor === null ? state.cursor : null };
}

/**
 * The selected message indices, ascending. No anchor → just the cursor; an anchor →
 * the inclusive `cursor..anchor` range (works in either direction). An empty list
 * (`count === 0`) selects nothing.
 */
export function selectedIndices(state: SelectorState): number[] {
  if (state.count === 0) return [];
  if (state.anchor === null) return [state.cursor];
  const lo = Math.min(state.cursor, state.anchor);
  const hi = Math.max(state.cursor, state.anchor);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/** A one-line role-prefixed label for a message, control-stripped. System messages return null (skipped). */
function exportLine(message: Message): string | null {
  if (message.role === "system") return null;
  const body = controlStrip(message.content);
  return `[${message.role}] ${body}`.trimEnd();
}

/**
 * Combine the selected messages into a clean copyable block: each non-system message
 * as `[role] text`, blank-line separated, content control-stripped. Indices outside
 * the list are ignored. An empty selection (or all-system) → "" (empty export).
 */
export function exportSelection(messages: readonly Message[], indices: readonly number[]): string {
  const blocks: string[] = [];
  for (const index of indices) {
    const message = messages[index];
    if (!message) continue;
    const line = exportLine(message);
    if (line !== null) blocks.push(line);
  }
  return blocks.join("\n\n");
}

/** A one-line preview of a message for the overlay list (role tag + clipped, stripped content). */
function previewRow(message: Message): string {
  const body = controlStrip(message.content);
  const clipped = body.length > 80 ? `${body.slice(0, 79)}…` : body;
  return `[${message.role}] ${clipped}`.trimEnd();
}

/**
 * Render the overlay list: one row per message, `▸ ` marks the cursor row, `✓` marks
 * a selected row (per `selectedIndices`). An empty list shows a clear placeholder.
 * Every message preview is control-stripped so a message can't inject escapes.
 */
export function formatSelector(messages: readonly Message[], state: SelectorState): string {
  if (state.count === 0) return "  (no messages)";
  const selected = new Set(selectedIndices(state));
  const rows: string[] = [];
  for (let i = 0; i < state.count; i++) {
    const message = messages[i];
    const cursorMark = i === state.cursor ? CURSOR_MARK : PLAIN_MARK;
    const selectMark = selected.has(i) ? SELECTED_MARK : UNSELECTED_MARK;
    const preview = message ? previewRow(message) : "[missing]";
    rows.push(`${cursorMark}${selectMark} ${preview}`);
  }
  return rows.join("\n");
}
