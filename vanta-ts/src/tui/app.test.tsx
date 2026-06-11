import { describe, it, expect } from "vitest";
import { render } from "./test-render.js";
import { App, reduce, type State } from "./app.js";
import { EntryRow, type Entry } from "./transcript.js";
import type { RunSetup } from "../session.js";

const base: State = { entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, focusMode: false };

describe("tui reduce", () => {
  it("user submit adds an entry and goes busy/thinking", () => {
    const s = reduce(base, { t: "user", text: "hi" });
    expect(s.entries).toEqual([{ kind: "user", text: "hi" }]);
    expect(s.busy).toBe(true);
    expect(s.status).toBe("thinking");
  });

  it("enqueue stores type-ahead and shows it; dequeue pops the first", () => {
    const a = reduce(reduce(base, { t: "enqueue", text: "first" }), { t: "enqueue", text: "second" });
    expect(a.queued).toEqual(["first", "second"]);
    expect(a.entries.at(-1)).toEqual({ kind: "note", text: "⏎ queued: second" });
    const b = reduce(a, { t: "dequeue" });
    expect(b.queued).toEqual(["second"]);
  });

  it("deltas accumulate into the streaming buffer", () => {
    const s = reduce(reduce(base, { t: "delta", d: "Hel" }), { t: "delta", d: "lo" });
    expect(s.streaming).toBe("Hello");
  });

  it("interrupt preserves partial output, adds a distinct marker, and ends the turn", () => {
    let s = reduce(base, { t: "user", text: "go" });
    s = reduce(s, { t: "delta", d: "partial answer" });
    s = reduce(s, { t: "interrupted" });
    expect(s.busy).toBe(false);
    expect(s.status).toBe("idle");
    expect(s.streaming).toBe("");
    // partial streamed text kept as an assistant entry, then the interrupted marker
    expect(s.entries.at(-2)).toEqual({ kind: "assistant", text: "partial answer" });
    expect(s.entries.at(-1)?.kind).toBe("interrupted");
  });

  it("compactBoundary appends a distinct boundary entry", () => {
    const s = reduce(base, { t: "compactBoundary", text: "compacted 12 messages · summary" });
    expect(s.entries.at(-1)).toEqual({ kind: "compactBoundary", text: "compacted 12 messages · summary" });
  });

  it("a tool call commits streamed text as an assistant entry then logs the tool", () => {
    let s = reduce(base, { t: "delta", d: "let me read it" });
    s = reduce(s, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "x" });
    expect(s.entries).toEqual([
      { kind: "assistant", text: "let me read it" },
      expect.objectContaining({ kind: "tool", name: "read_file", icon: "📖", verb: "read", detail: "x" }),
    ]);
    expect(s.streaming).toBe("");
    expect(s.status).toBe("read x");
  });

  it("a tool result fills ok on success (no error line) on the matching open tool entry", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "" });
    s = reduce(s, { t: "toolResult", name: "read_file", ok: true });
    expect(s.entries[0]).toEqual(expect.objectContaining({ kind: "tool", name: "read_file", icon: "📖", verb: "read", detail: "", ok: true, errorLine: undefined, summary: undefined }));
  });

  it("a tool result stores the result summary for the collapsed one-liner", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "x" });
    s = reduce(s, { t: "toolResult", name: "read_file", ok: true, summary: "254 lines" });
    const e = s.entries[0];
    expect(e?.kind === "tool" && e.summary).toBe("254 lines");
  });

  it("second consecutive tool call gets isGrouped:true; first gets false", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "a" });
    s = reduce(s, { t: "toolCall", name: "shell_cmd", icon: "❯", verb: "ran", detail: "b" });
    const first = s.entries[0];
    const second = s.entries[1];
    expect(first?.kind === "tool" && first.isGrouped).toBe(false);
    expect(second?.kind === "tool" && second.isGrouped).toBe(true);
  });

  it("toggleExpand flips the transcript fold state", () => {
    expect(reduce(base, { t: "toggleExpand" }).expanded).toBe(true);
    expect(reduce(reduce(base, { t: "toggleExpand" }), { t: "toggleExpand" }).expanded).toBe(false);
  });

  it("a failed tool result records the error line", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "x" });
    s = reduce(s, { t: "toolResult", name: "read_file", ok: false, errorLine: "no such file" });
    const e = s.entries[0];
    expect(e?.kind === "tool" && e.ok).toBe(false);
    expect(e?.kind === "tool" && e.errorLine).toBe("no such file");
  });

  it("commit uses finalText (the display-hook output), falling back to streamed text only when it is empty", () => {
    // finalText is authoritative — the loop already ran it through the message_display
    // hooks, so a rewrite supersedes the raw text streamed live.
    expect(reduce({ ...base, streaming: "streamed" }, { t: "commit", finalText: "final" }).entries).toEqual([
      { kind: "assistant", text: "final" },
    ]);
    // Falls back to the streamed buffer when the loop returned nothing (e.g. interrupt).
    expect(reduce({ ...base, streaming: "streamed" }, { t: "commit", finalText: "" }).entries).toEqual([
      { kind: "assistant", text: "streamed" },
    ]);
    expect(reduce(base, { t: "commit", finalText: "final" }).entries).toEqual([
      { kind: "assistant", text: "final" },
    ]);
  });

  it("clear empties the transcript", () => {
    const s = reduce({ ...base, entries: [{ kind: "user", text: "x" }], busy: true, expanded: true }, { t: "clear" });
    expect(s).toEqual({ entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, focusMode: false });
  });
});

describe("App render", () => {
  const setup = {
    provider: { modelId: () => "fake-model", contextWindow: () => 128_000, complete: async () => ({ text: "", toolCalls: [], finishReason: "stop" }) },
    safety: { logEvent: async () => {}, getGoals: async () => [] },
    registry: { schemas: () => [], get: () => undefined },
    goals: [],
    systemPrompt: "sys",
  } as unknown as RunSetup;

  it("mounts under Ink and shows the status line + input prompt", () => {
    const { lastFrame, unmount } = render(<App setup={setup} repoRoot="/x" />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ready");
    expect(frame).toContain("fake-model");
    unmount();
  });

  // Proves the slash EXECUTION path end-to-end (type → Enter → handler output
  // renders), not just that handlers are wired. Settles "slash commands don't
  // work" with evidence rather than code-reading.
  it("executes a slash command: typing /help and pressing Enter renders the command list", async () => {
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 70)); // > the input parser's 50ms lone-Esc flush timeout
    const { lastFrame, stdin, unmount } = render(<App setup={setup} repoRoot="/x" />);
    stdin.write("/help");
    await tick();
    stdin.write("\r"); // Enter
    await tick();
    const frame = lastFrame() ?? "";
    // The ScrollBox pins to the bottom, so assert on SLASH_HELP's tail —
    // the header line has scrolled above the viewport.
    expect(frame).toContain("Anything else is sent to the agent");
    unmount();
  });
});

describe("Transcript fold", () => {
  const wrote: Entry = {
    kind: "tool", name: "write_file", icon: "✎", verb: "wrote", detail: "x.ts",
    ok: true, diff: [{ type: "add", text: "hello world" }, { type: "remove", text: "old line" }],
  };

  it("collapses the diff to a +/- count by default, hiding the body", () => {
    const { lastFrame, unmount } = render(<EntryRow entry={wrote} expanded={false} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("+1/-1"); // diffStat one-liner
    expect(frame).not.toContain("hello world"); // body folded
    unmount();
  });

  it("reveals the full diff when expanded", () => {
    const { lastFrame, unmount } = render(<EntryRow entry={wrote} expanded />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("hello world");
    unmount();
  });
});

describe("interrupted entry", () => {
  it("renders a distinct ⎋ marker", () => {
    const entry: Entry = { kind: "interrupted", text: "interrupted — agent stopped mid-turn" };
    const { lastFrame, unmount } = render(<EntryRow entry={entry} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("⎋");
    expect(frame).toContain("interrupted");
    unmount();
  });
});

describe("compactBoundary entry", () => {
  it("renders a distinct ✻ separator with the message count", () => {
    const entry: Entry = { kind: "compactBoundary", text: "compacted 12 messages · brief summary" };
    const { lastFrame, unmount } = render(<EntryRow entry={entry} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("✻");
    expect(frame).toContain("compacted 12 messages");
    unmount();
  });
});
