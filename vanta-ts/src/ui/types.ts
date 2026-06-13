import type { DiffLine } from "../util/diff.js";

// The new Claude-method UI (real Ink, inline + <Static>). Finished entries commit
// to native terminal scrollback exactly once; only the live tail redraws. This is
// the whole reason selection/scroll/copy work and nothing ghosts — the terminal
// owns history, we own a small bottom region.

export type ToolEntry = {
  kind: "tool";
  name: string;
  verb: string;
  detail: string;
  ok?: boolean;
  errorLine?: string;
  summary?: string;
  diff?: DiffLine[];
};

export type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | ToolEntry
  | { kind: "note"; text: string }
  | { kind: "thinking"; text: string };

export type UiState = {
  /** Committed history — rendered in <Static>, flushed to scrollback once each. */
  entries: Entry[];
  /** The in-flight assistant text for this turn (live region only). */
  streaming: string;
  /** Verb of the tool currently running, or null. Shown in the live status line. */
  activeTool: string | null;
  busy: boolean;
};

export const initialState: UiState = { entries: [], streaming: "", activeTool: null, busy: false };
