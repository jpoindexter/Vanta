import type { Entry } from "./transcript.js";
import type { DiffLine } from "../util/diff.js";

export type State = { entries: Entry[]; streaming: string; busy: boolean; status: string; queued: string[]; expanded: boolean; viewOffset: number };

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
  | { t: "scrollBy"; delta: number }
  | { t: "scrollReset" }
  | { t: "clear" };

function commitStreaming(entries: Entry[], streaming: string): Entry[] {
  return streaming.trim() ? [...entries, { kind: "assistant", text: streaming }] : entries;
}

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "user":
      return { ...s, entries: [...s.entries, { kind: "user", text: a.text }], busy: true, streaming: "", status: "thinking", viewOffset: 0 };
    case "delta":
      return { ...s, streaming: s.streaming + a.d, status: "generating" };
    case "toolCall": {
      const prevEntries = commitStreaming(s.entries, s.streaming);
      const isGrouped = prevEntries[prevEntries.length - 1]?.kind === "tool";
      return {
        ...s,
        entries: [...prevEntries, { kind: "tool", name: a.name, icon: a.icon, verb: a.verb, detail: a.detail, isGrouped }],
        streaming: "",
        status: `${a.verb}${a.detail ? ` ${a.detail}` : ""}`,
      };
    }
    case "toolResult": {
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
    case "commit": {
      // finalText is authoritative: the agent loop has already run it through the
      // message_display hooks, so a rewrite (e.g. stripped <thinking>) supersedes
      // the raw text streamed live. Fall back to the streamed buffer only when the
      // loop returned nothing (e.g. an interrupt with partial output).
      const text = a.finalText.trim() || s.streaming.trim();
      const entries = text ? [...s.entries, { kind: "assistant" as const, text }] : s.entries;
      return { ...s, entries, streaming: "", busy: false, status: "idle" };
    }
    case "interrupted": {
      // Preserve any partial streamed text, then a distinct marker; the turn ends.
      const entries = commitStreaming(s.entries, s.streaming);
      return { ...s, entries: [...entries, { kind: "interrupted", text: "interrupted — agent stopped mid-turn" }], streaming: "", busy: false, status: "idle", viewOffset: 0 };
    }
    case "compactBoundary":
      return { ...s, entries: [...s.entries, { kind: "compactBoundary", text: a.text }] };
    case "note":
      return { ...s, entries: [...s.entries, { kind: "note", text: a.text }] };
    case "thinking":
      return { ...s, entries: [...s.entries, { kind: "thinking", text: a.text }] };
    case "enqueue":
      return { ...s, entries: [...s.entries, { kind: "note", text: `⏎ queued: ${a.text}` }], queued: [...s.queued, a.text] };
    case "dequeue":
      return { ...s, queued: s.queued.slice(1) };
    case "toggleExpand":
      return { ...s, expanded: !s.expanded };
    case "scrollBy":
      return { ...s, viewOffset: Math.max(0, s.viewOffset + a.delta) };
    case "scrollReset":
      return { ...s, viewOffset: 0 };
    case "clear":
      return { entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, viewOffset: 0 };
  }
}
