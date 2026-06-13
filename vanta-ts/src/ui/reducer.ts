import type { Entry, UiState } from "./types.js";
import type { DiffLine } from "../util/diff.js";

// One small reducer. The key invariant for the Claude method: when a turn ends,
// the streamed assistant text becomes a committed Entry (moves into <Static>) and
// `streaming` clears — so the live region stays tiny and history is immutable.

export type Action =
  | { t: "submit"; text: string }
  | { t: "delta"; d: string }
  | { t: "thinking"; text: string }
  | { t: "toolCall"; verb: string; name: string; detail: string }
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string; summary?: string; diff?: DiffLine[] }
  | { t: "note"; text: string }
  | { t: "turnStart" }
  | { t: "turnEnd" };

export function reduce(state: UiState, a: Action): UiState {
  switch (a.t) {
    case "submit":
      return { ...state, entries: [...state.entries, { kind: "user", text: a.text }] };
    case "turnStart":
      return { ...state, busy: true, streaming: "", activeTool: null };
    case "delta":
      return { ...state, streaming: state.streaming + a.d };
    case "thinking":
      return { ...state, entries: [...state.entries, { kind: "thinking", text: a.text }] };
    case "toolCall":
      return { ...state, activeTool: a.verb, entries: [...state.entries, { kind: "tool", name: a.name, verb: a.verb, detail: a.detail }] };
    case "toolResult":
      return { ...state, activeTool: null, entries: completeTool(state.entries, a) };
    case "note":
      return { ...state, entries: [...state.entries, { kind: "note", text: a.text }] };
    case "turnEnd":
      return commitStreaming(state);
    default:
      return state;
  }
}

/** Fill the last pending tool entry (matching name) with its result. */
function completeTool(entries: Entry[], a: Extract<Action, { t: "toolResult" }>): Entry[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e?.kind === "tool" && e.name === a.name && e.ok === undefined) {
      const next = entries.slice();
      next[i] = { ...e, ok: a.ok, errorLine: a.errorLine, summary: a.summary, diff: a.diff };
      return next;
    }
  }
  return entries;
}

/** Commit the streamed text to history (→ <Static>) and clear the live region. */
function commitStreaming(state: UiState): UiState {
  const text = state.streaming.trim();
  const entries = text ? [...state.entries, { kind: "assistant" as const, text }] : state.entries;
  return { ...state, entries, streaming: "", activeTool: null, busy: false };
}
