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
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string; summary?: string; diff?: DiffLine[]; tokens?: number }
  | { t: "note"; text: string }
  | { t: "todos"; items: TodoItem[] }
  | { t: "enqueue"; text: string }
  | { t: "dequeue" }
  | { t: "turnStart" }
  | { t: "turnEnd" };

export function reduce(state: UiState, a: Action): UiState {
  switch (a.t) {
    case "submit": {
      const s = flush(state);
      return { ...s, entries: [...s.entries, { kind: "user", text: a.text }] };
    }
    case "turnStart":
      return { ...state, busy: true, streaming: "", activeTools: [] };
    case "delta":
      // Commit COMPLETE paragraphs into <Static> as they stream (hermes/CC: text flows
      // into scrollback, scrolling old content up). Only the in-progress paragraph stays
      // in the redrawing live region. Without this the response is a bounded window pinned
      // under the user's message instead of scrolling up.
      return drainParagraphs({ ...state, streaming: state.streaming + a.d });
    case "thinking": {
      const s = flush(state);
      return { ...s, entries: [...s.entries, { kind: "thinking", text: a.text }] };
    }
    case "toolCall": {
      // Commit any streamed assistant text to <Static> NOW, before the tool runs.
      // A tool call (esp. an approval-gated one) can hold the live region for a
      // long time; leaving the text there lets every redraw frame leak into
      // scrollback (ghosting). Committed text leaves the redrawing region.
      const s = commitText(state);
      return { ...s, activeTools: [...s.activeTools, { name: a.name, verb: a.verb, detail: a.detail }] };
    }
    case "toolResult":
      return completeTool(state, a);
    case "turnEnd":
      return commitStreaming(flushGroup(state));
    default:
      return reduceAux(state, a);
  }
}

/** Commit the buffered tool run as one toolGroup entry (the grouped-header look). */
function flushGroup(state: UiState): UiState {
  if (state.pendingGroup.length === 0) return state;
  return { ...state, entries: [...state.entries, { kind: "toolGroup", tools: state.pendingGroup }], pendingGroup: [] };
}

/** Append an assistant chunk. `cont:true` (no fresh ⏺ marker) ONLY when the newest
 * entry is already assistant text — a continuation of the same streamed reply. The
 * key is omitted otherwise, so a fresh reply stays `{kind,text}` (stateless, derived). */
function pushAssistant(state: UiState, text: string): Entry[] {
  const cont = state.entries[state.entries.length - 1]?.kind === "assistant";
  const entry: Entry = cont ? { kind: "assistant", text, cont: true } : { kind: "assistant", text };
  return [...state.entries, entry];
}

/** Commit in-flight streamed text to history (→ <Static>) WITHOUT ending the turn,
 * clearing `streaming` so the redrawing live region drops it. No-op when empty. */
function commitText(state: UiState): UiState {
  const text = state.streaming.trim();
  if (!text) return state;
  return { ...state, entries: pushAssistant(state, text), streaming: "" };
}

/** Flush COMPLETE paragraphs (everything before the last blank line) into <Static>
 * during streaming, keeping the in-progress paragraph in `streaming`. No-op until a
 * paragraph boundary appears. This is what makes streamed text flow up into scrollback. */
function drainParagraphs(state: UiState): UiState {
  const brk = state.streaming.lastIndexOf("\n\n");
  if (brk < 0) return state;
  const complete = state.streaming.slice(0, brk).trim();
  const rest = state.streaming.slice(brk + 2);
  if (!complete) return { ...state, streaming: rest };
  return { ...state, entries: pushAssistant(state, complete), streaming: rest };
}

/** Commit both pending text and the pending tool run, in turn order (text first).
 * Used before any non-tool entry (user/thinking/note) is appended. */
function flush(state: UiState): UiState {
  return flushGroup(commitText(state));
}

/** The append/queue actions, split out so each switch stays under the complexity gate. */
function reduceAux(state: UiState, a: Action): UiState {
  switch (a.t) {
    case "note": {
      const s = flush(state);
      return { ...s, entries: [...s.entries, { kind: "note", text: a.text }] };
    }
    case "todos":
      return { ...state, todos: a.items };
    case "enqueue":
      return { ...state, queued: [...state.queued, a.text] };
    case "dequeue":
      return { ...state, queued: state.queued.slice(1) };
    default:
      return state;
  }
}

/** Move the matching in-flight tool out of activeTools and buffer it into the
 * current run (pendingGroup); it commits as part of a toolGroup on the next flush. */
function completeTool(state: UiState, a: Extract<Action, { t: "toolResult" }>): UiState {
  const idx = lastIndexByName(state.activeTools, a.name);
  const pend: PendingTool | undefined = idx >= 0 ? state.activeTools[idx] : undefined;
  const activeTools = idx >= 0 ? state.activeTools.filter((_, i) => i !== idx) : state.activeTools;
  const entry: ToolEntry = {
    kind: "tool", name: a.name, verb: pend?.verb ?? a.name, detail: pend?.detail ?? "",
    ok: a.ok, errorLine: a.errorLine, summary: a.summary, diff: a.diff, tokens: a.tokens,
  };
  return { ...state, activeTools, pendingGroup: [...state.pendingGroup, entry] };
}

/** Index of the last in-flight tool with this name (FIFO would mismatch interleaved calls). */
function lastIndexByName(tools: PendingTool[], name: string): number {
  for (let i = tools.length - 1; i >= 0; i--) if (tools[i]!.name === name) return i;
  return -1;
}

/** End the turn: commit any trailing streamed text and clear the live region. */
function commitStreaming(state: UiState): UiState {
  return { ...commitText(state), activeTools: [], busy: false };
}
