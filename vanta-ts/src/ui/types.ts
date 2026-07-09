import type { DiffLine } from "../util/diff.js";
import type { TodoItem } from "../todo/store.js";

// The new Claude-method UI (real Ink, inline + <Static>). Finished entries commit
// to native terminal scrollback exactly once; only the live tail redraws. This is
// the whole reason selection/scroll/copy work and nothing ghosts — the terminal
// owns history, we own a small bottom region.
//
// KEY INVARIANT: <Static> renders each item ONCE and never repaints it. So a tool
// row is committed to `entries` only when it COMPLETES (with its ✓/✗ + summary +
// diff). While a tool is in flight it lives in `activeTools` (the live region),
// never in committed history.

export type ToolEntry = {
  kind: "tool";
  name: string;
  verb: string;
  detail: string;
  ok?: boolean;
  errorLine?: string;
  summary?: string;
  diff?: DiffLine[];
  tokens?: number;
};

/** A run of consecutive tool calls, committed as one block with a header. */
export type ToolGroupEntry = { kind: "toolGroup"; tools: ToolEntry[] };

export type Entry =
  | { kind: "user"; text: string }
  // `cont` = a continuation chunk of a streamed reply (committed paragraph-by-paragraph
  // so it flows into scrollback); rendered without a fresh ⏺ marker.
  | { kind: "assistant"; text: string; cont?: boolean }
  | ToolEntry
  | ToolGroupEntry
  | { kind: "note"; text: string }
  | { kind: "thinking"; text: string };

/** A tool currently executing — shown in the live region, not committed history. */
export type PendingTool = { name: string; verb: string; detail: string };

export type UiState = {
  /** Committed history — rendered in <Static>, flushed to scrollback once each. */
  entries: Entry[];
  /** The in-flight assistant text for this turn (live region only). */
  streaming: string;
  /** Tools currently running — live region only, cleared as each result lands. */
  activeTools: PendingTool[];
  /** Completed tools in the current run, buffered until a non-tool entry flushes
   * them into history as one toolGroup (the grouped-header look). */
  pendingGroup: ToolEntry[];
  /** The agent's current plan (todo list), shown as a live panel when non-empty. */
  todos: TodoItem[];
  /** Messages submitted while busy — drained one per turn when idle. */
  queued: string[];
  busy: boolean;
  /** Live reasoning preview for THIS turn (live region only, never committed). Reasoning models
   *  that stream their thinking fill this during the pre-output phase; cleared when output text
   *  begins or the turn ends. Empty for backends that hide reasoning (e.g. codex). */
  liveThinking: string;
  /** True while the current session is actively compacting context. */
  compacting: boolean;
};

export const initialState: UiState = { entries: [], streaming: "", activeTools: [], pendingGroup: [], todos: [], queued: [], busy: false, liveThinking: "", compacting: false };
