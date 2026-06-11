import type { Entry } from "./transcript.js";
import type { DiffLine } from "../util/diff.js";

export type State = { entries: Entry[]; streaming: string; busy: boolean; status: string; queued: string[]; expanded: boolean; focusMode: boolean };

export type Action =
  | { t: "user"; text: string }
  | { t: "delta"; d: string }
  | { t: "toolCall"; name: string; icon: string; verb: string; detail: string }
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string; summary?: string; diff?: DiffLine[]; resultOutput?: string; lineCount?: number }
  | { t: "commit"; finalText: string }
  | { t: "interrupted" }
  | { t: "compactBoundary"; text: string }
  | { t: "note"; text: string }
  | { t: "thinking"; text: string }
  | { t: "enqueue"; text: string }
  | { t: "dequeue" }
  | { t: "toggleExpand" }
  | { t: "toggleFocus" }
  | { t: "clear" };

function commitStreaming(entries: Entry[], streaming: string): Entry[] {
  return streaming.trim() ? [...entries, { kind: "assistant", text: streaming }] : entries;
}

function handleToolCall(s: State, a: Extract<Action, { t: "toolCall" }>): State {
  const prevEntries = commitStreaming(s.entries, s.streaming);
  const isGrouped = prevEntries[prevEntries.length - 1]?.kind === "tool";
  return {
    ...s,
    entries: [...prevEntries, { kind: "tool", name: a.name, icon: a.icon, verb: a.verb, detail: a.detail, isGrouped }],
    streaming: "",
    status: `${a.verb}${a.detail ? ` ${a.detail}` : ""}`,
  };
}

function handleToolResult(s: State, a: Extract<Action, { t: "toolResult" }>): State {
  const entries = [...s.entries];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e.kind === "tool" && e.name === a.name && e.ok === undefined) {
      entries[i] = { ...e, ok: a.ok, errorLine: a.errorLine, summary: a.summary, diff: a.diff, resultOutput: a.resultOutput, lineCount: a.lineCount };
      break;
    }
  }
  return { ...s, entries, status: "thinking" };
}

function handleCommit(s: State, a: Extract<Action, { t: "commit" }>): State {
  // finalText is authoritative: the agent loop has already run it through the
  // message_display hooks, so a rewrite (e.g. stripped <thinking>) supersedes
  // the raw text streamed live. Fall back to the streamed buffer only when the
  // loop returned nothing (e.g. an interrupt with partial output).
  const text = a.finalText.trim() || s.streaming.trim();
  const entries = text ? [...s.entries, { kind: "assistant" as const, text }] : s.entries;
  return { ...s, entries, streaming: "", busy: false, status: "idle" };
}

function handleInterrupted(s: State): State {
  // Preserve any partial streamed text, then a distinct marker; the turn ends.
  const entries = commitStreaming(s.entries, s.streaming);
  return { ...s, entries: [...entries, { kind: "interrupted", text: "interrupted — agent stopped mid-turn" }], streaming: "", busy: false, status: "idle" };
}

function handleAppend(s: State, a: Extract<Action, { t: "compactBoundary" | "note" | "thinking" | "enqueue" }>): State {
  if (a.t === "enqueue") {
    return { ...s, entries: [...s.entries, { kind: "note", text: `⏎ queued: ${a.text}` }], queued: [...s.queued, a.text] };
  }
  const kind = a.t === "compactBoundary" ? "compactBoundary" : a.t === "note" ? "note" : "thinking";
  return { ...s, entries: [...s.entries, { kind, text: a.text }] };
}

type SimpleAction = Extract<Action, { t: "delta" | "dequeue" | "toggleExpand" | "toggleFocus" | "clear" }>;

function handleSimple(s: State, a: SimpleAction): State {
  switch (a.t) {
    case "delta":        return { ...s, streaming: s.streaming + a.d, status: "generating" };
    case "dequeue":      return { ...s, queued: s.queued.slice(1) };
    case "toggleExpand": return { ...s, expanded: !s.expanded };
    case "toggleFocus":  return { ...s, focusMode: !s.focusMode };
    case "clear":
      return { entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, focusMode: s.focusMode };
  }
}

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "user":
      return { ...s, entries: [...s.entries, { kind: "user", text: a.text }], busy: true, streaming: "", status: "thinking" };
    case "toolCall":     return handleToolCall(s, a);
    case "toolResult":   return handleToolResult(s, a);
    case "commit":       return handleCommit(s, a);
    case "interrupted":  return handleInterrupted(s);
    case "compactBoundary":
    case "note":
    case "thinking":
    case "enqueue":      return handleAppend(s, a);
    default:             return handleSimple(s, a as SimpleAction);
  }
}
