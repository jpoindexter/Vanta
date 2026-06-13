import type { Entry, PendingTool, ToolEntry, UiState } from "./types.js";
import type { DiffLine } from "../util/diff.js";
import type { TodoItem } from "../todo/store.js";

// One small reducer. The key invariant for the Claude method: a tool row is
// committed to history (→ <Static>, which never repaints) only when it COMPLETES;
// in-flight tools live in `activeTools` (the redrawing live region). Likewise the
// streamed assistant text commits to an Entry on turnEnd and `streaming` clears.

export type Action =
  | { t: "submit"; text: string }
  | { t: "delta"; d: string }
  | { t: "thinking"; text: string }
  | { t: "toolCall"; verb: string; name: string; detail: string }
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string; summary?: string; diff?: DiffLine[] }
  | { t: "note"; text: string }
  | { t: "todos"; items: TodoItem[] }
  | { t: "turnStart" }
  | { t: "turnEnd" };

export function reduce(state: UiState, a: Action): UiState {
  switch (a.t) {
    case "submit":
      return { ...state, entries: [...state.entries, { kind: "user", text: a.text }] };
    case "turnStart":
      return { ...state, busy: true, streaming: "", activeTools: [] };
    case "delta":
      return { ...state, streaming: state.streaming + a.d };
    case "thinking":
      return { ...state, entries: [...state.entries, { kind: "thinking", text: a.text }] };
    case "toolCall":
      return { ...state, activeTools: [...state.activeTools, { name: a.name, verb: a.verb, detail: a.detail }] };
    case "toolResult":
      return completeTool(state, a);
    case "note":
      return { ...state, entries: [...state.entries, { kind: "note", text: a.text }] };
    case "todos":
      return { ...state, todos: a.items };
    case "turnEnd":
      return commitStreaming(state);
    default:
      return state;
  }
}

/** Move the matching in-flight tool out of activeTools and commit it as a
 * completed entry (carrying its ✓/✗, summary, and diff). */
function completeTool(state: UiState, a: Extract<Action, { t: "toolResult" }>): UiState {
  const idx = lastIndexByName(state.activeTools, a.name);
  const pend: PendingTool | undefined = idx >= 0 ? state.activeTools[idx] : undefined;
  const activeTools = idx >= 0 ? state.activeTools.filter((_, i) => i !== idx) : state.activeTools;
  const entry: ToolEntry = {
    kind: "tool", name: a.name, verb: pend?.verb ?? a.name, detail: pend?.detail ?? "",
    ok: a.ok, errorLine: a.errorLine, summary: a.summary, diff: a.diff,
  };
  return { ...state, activeTools, entries: [...state.entries, entry] };
}

/** Index of the last in-flight tool with this name (FIFO would mismatch interleaved calls). */
function lastIndexByName(tools: PendingTool[], name: string): number {
  for (let i = tools.length - 1; i >= 0; i--) if (tools[i]!.name === name) return i;
  return -1;
}

/** Commit the streamed text to history (→ <Static>) and clear the live region. */
function commitStreaming(state: UiState): UiState {
  const text = state.streaming.trim();
  const entries: Entry[] = text ? [...state.entries, { kind: "assistant", text }] : state.entries;
  return { ...state, entries, streaming: "", activeTools: [], busy: false };
}
