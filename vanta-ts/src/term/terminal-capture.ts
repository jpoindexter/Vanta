// VANTA-TERMINAL-CAPTURE — pure capture-PROCESSING for a terminal panel snapshot.
//
// Turns a raw terminal buffer (the bytes a PTY / host terminal scrollback hands
// us, full of ANSI/CSI/OSC escape sequences) into a clean, control-stripped,
// line-bounded text snapshot the agent can read and reason over. This file is the
// PURE layer: strip → bound → snapshot, plus the panel toggle state. NO PTY, no
// process, no terminal I/O lives here.
//
// WIRING (the live boundary, not built this round): a `terminal_capture` tool —
// or the TUI's terminal panel — owns the live buffer. The host reads the current
// terminal content (node-pty's data buffer, or the host terminal's scrollback)
// and calls
//   const snap = captureToSnapshot(rawBuffer, { maxLines });
// to get clean text + metadata it surfaces to the model. The Meta+J keybinding in
// the TUI calls
//   state = toggleCapturePanel(state);
// to show/hide the panel. The live PTY/terminal buffer is the documented,
// INJECTED boundary; this module never touches a PTY or the host terminal.
//
// SECURITY: terminal content is UNTRUSTED — a captured buffer can carry escape
// sequences a malicious program emitted. We strip the WHOLE ANSI/CSI/OSC sequence
// (reusing bash-io's `stripKeepNewlines`, not just bare ESC) so a captured buffer
// can never inject terminal control codes when the snapshot is later rendered to
// the operator or fed to the model. This is the core security property — asserted
// with ESC/CSI/OSC fixtures in the test.

import { stripKeepNewlines } from "./bash-io.js";

/** Default cap on retained lines — keeps the LAST N (most recent scrollback). */
const DEFAULT_MAX_LINES = 200;
/** Floor for `maxLines` — a non-positive request falls back to the default. */
const MIN_MAX_LINES = 1;
/** Env flag that enables capture. Off unless explicitly set to "1". */
const ENABLE_ENV = "VANTA_TERMINAL_CAPTURE";
const ENABLE_VALUE = "1";

/** Options for processing a captured buffer. */
export type CaptureOptions = {
  /** Max lines to retain, keeping the LAST N. Default 200; <1 → default. */
  maxLines?: number;
};

/** A processed snapshot plus the metadata a host surfaces alongside it. */
export type CaptureSnapshot = {
  /** The clean, control-stripped, line-bounded text. */
  text: string;
  /** Number of lines in `text` (0 for an empty snapshot). */
  lineCount: number;
  /** True when the buffer was clipped to `maxLines` (older lines dropped). */
  truncated: boolean;
};

/** The terminal panel's visibility state (Meta+J toggles it). */
export type CapturePanelState = {
  /** Whether the capture panel is shown. */
  visible: boolean;
};

/** Resolve the effective line cap, falling back to the default when invalid. */
function resolveMaxLines(maxLines: number | undefined): number {
  if (typeof maxLines !== "number" || !Number.isFinite(maxLines) || maxLines < MIN_MAX_LINES) {
    return DEFAULT_MAX_LINES;
  }
  return Math.floor(maxLines);
}

/** Drop trailing blank (empty/whitespace-only) lines, keeping interior blanks. */
function collapseTrailingBlanks(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") end -= 1;
  return lines.slice(0, end);
}

/**
 * Process a raw terminal buffer into a clean snapshot string:
 * - strip the WHOLE ANSI/CSI/OSC + control sequences (newlines KEPT) — security,
 * - trim trailing whitespace per line,
 * - collapse trailing blank lines,
 * - clip to the LAST `maxLines` lines (default 200).
 * Empty/whitespace-only buffer → "". Pure.
 */
export function processCapture(rawBuffer: string, opts: CaptureOptions = {}): string {
  const stripped = stripKeepNewlines(rawBuffer).replace(/[ \t]+$/gm, "");
  if (stripped.trim() === "") return "";
  const max = resolveMaxLines(opts.maxLines);
  const lines = collapseTrailingBlanks(stripped.split("\n"));
  const clipped = lines.length > max ? lines.slice(lines.length - max) : lines;
  return clipped.join("\n");
}

/**
 * Process a raw buffer AND report the metadata a host surfaces with it:
 * `{ text, lineCount, truncated }`. `truncated` is true when the processed line
 * count exceeded `maxLines` (older lines were dropped). Empty buffer →
 * `{ text:"", lineCount:0, truncated:false }`. Pure.
 */
export function captureToSnapshot(rawBuffer: string, opts: CaptureOptions = {}): CaptureSnapshot {
  const text = processCapture(rawBuffer, opts);
  if (text === "") return { text: "", lineCount: 0, truncated: false };
  const max = resolveMaxLines(opts.maxLines);
  const stripped = stripKeepNewlines(rawBuffer).replace(/[ \t]+$/gm, "");
  const total = collapseTrailingBlanks(stripped.split("\n")).length;
  return { text, lineCount: text.split("\n").length, truncated: total > max };
}

/** The starting panel state — hidden until the operator toggles it (Meta+J). */
export function emptyCapturePanelState(): CapturePanelState {
  return { visible: false };
}

/** Flip the panel's visibility. Pure — returns the NEXT state, never mutates. */
export function toggleCapturePanel(state: CapturePanelState): CapturePanelState {
  return { visible: !state.visible };
}

/** Whether terminal capture is enabled. Off unless `VANTA_TERMINAL_CAPTURE=1`. */
export function captureEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[ENABLE_ENV] === ENABLE_VALUE;
}
