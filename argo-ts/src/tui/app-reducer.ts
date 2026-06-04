import type { Entry } from "./transcript.js";

export type State = { entries: Entry[]; streaming: string; busy: boolean; status: string; queued: string[] };

export type Action =
  | { t: "user"; text: string }
  | { t: "delta"; d: string }
  | { t: "toolCall"; name: string; icon: string; verb: string; detail: string }
  | { t: "toolResult"; name: string; ok: boolean; errorLine?: string }
  | { t: "commit"; finalText: string }
  | { t: "note"; text: string }
  | { t: "enqueue"; text: string }
  | { t: "dequeue" }
  | { t: "clear" };

function commitStreaming(entries: Entry[], streaming: string): Entry[] {
  return streaming.trim() ? [...entries, { kind: "assistant", text: streaming }] : entries;
}

export function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "user":
      return { ...s, entries: [...s.entries, { kind: "user", text: a.text }], busy: true, streaming: "", status: "thinking" };
    case "delta":
      return { ...s, streaming: s.streaming + a.d, status: "generating" };
    case "toolCall":
      return {
        ...s,
        entries: [
          ...commitStreaming(s.entries, s.streaming),
          { kind: "tool", name: a.name, icon: a.icon, verb: a.verb, detail: a.detail },
        ],
        streaming: "",
        status: `${a.verb}${a.detail ? ` ${a.detail}` : ""}`,
      };
    case "toolResult": {
      const entries = [...s.entries];
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e && e.kind === "tool" && e.name === a.name && e.ok === undefined) {
          entries[i] = { ...e, ok: a.ok, errorLine: a.errorLine };
          break;
        }
      }
      return { ...s, entries, status: "thinking" };
    }
    case "commit": {
      const text = s.streaming.trim() || a.finalText;
      const entries = text ? [...s.entries, { kind: "assistant" as const, text }] : s.entries;
      return { ...s, entries, streaming: "", busy: false, status: "idle" };
    }
    case "note":
      return { ...s, entries: [...s.entries, { kind: "note", text: a.text }] };
    case "enqueue":
      return { ...s, entries: [...s.entries, { kind: "note", text: `⏎ queued: ${a.text}` }], queued: [...s.queued, a.text] };
    case "dequeue":
      return { ...s, queued: s.queued.slice(1) };
    case "clear":
      return { entries: [], streaming: "", busy: false, status: "idle", queued: [] };
  }
}
