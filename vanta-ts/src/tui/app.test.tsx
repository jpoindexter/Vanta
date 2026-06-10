import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { App, reduce, type State } from "./app.js";
import { EntryRow, type Entry } from "./transcript.js";
import type { RunSetup } from "../session.js";

const base: State = { entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, viewOffset: 0 };

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

  it("scrollBy increases viewOffset; scrollReset and user submit both zero it", () => {
    let s = reduce(base, { t: "scrollBy", delta: 10 });
    expect(s.viewOffset).toBe(10);
    s = reduce(s, { t: "scrollBy", delta: -3 });
    expect(s.viewOffset).toBe(7);
    s = reduce(s, { t: "scrollBy", delta: -999 });
    expect(s.viewOffset).toBe(0); // floor at 0
    s = reduce(base, { t: "scrollBy", delta: 5 });
    s = reduce(s, { t: "scrollReset" });
    expect(s.viewOffset).toBe(0);
    s = reduce(base, { t: "scrollBy", delta: 5 });
    s = reduce(s, { t: "user", text: "new message" });
    expect(s.viewOffset).toBe(0); // user submit resets scroll
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

  it("commit uses the streamed text, or the final text when nothing streamed", () => {
    expect(reduce({ ...base, streaming: "streamed" }, { t: "commit", finalText: "final" }).entries).toEqual([
      { kind: "assistant", text: "streamed" },
    ]);
    expect(reduce(base, { t: "commit", finalText: "final" }).entries).toEqual([
      { kind: "assistant", text: "final" },
    ]);
  });

  it("clear empties the transcript", () => {
    const s = reduce({ ...base, entries: [{ kind: "user", text: "x" }], busy: true, expanded: true }, { t: "clear" });
    expect(s).toEqual({ entries: [], streaming: "", busy: false, status: "idle", queued: [], expanded: false, viewOffset: 0 });
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
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 30));
    const { lastFrame, stdin, unmount } = render(<App setup={setup} repoRoot="/x" />);
    stdin.write("/help");
    await tick();
    stdin.write("\r"); // Enter
    await tick();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Commands:"); // first line of SLASH_HELP
    unmount();
  });
});

describe("Transcript fold (CC-TRANSCRIPT)", () => {
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
