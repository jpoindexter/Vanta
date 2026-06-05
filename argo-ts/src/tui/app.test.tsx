import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { App, reduce, type State } from "./app.js";
import type { RunSetup } from "../session.js";

const base: State = { entries: [], streaming: "", busy: false, status: "idle", queued: [] };

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
      { kind: "tool", name: "read_file", icon: "📖", verb: "read", detail: "x" },
    ]);
    expect(s.streaming).toBe("");
    expect(s.status).toBe("read x");
  });

  it("a tool result fills ok on success (no error line) on the matching open tool entry", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", icon: "📖", verb: "read", detail: "" });
    s = reduce(s, { t: "toolResult", name: "read_file", ok: true });
    expect(s.entries[0]).toEqual({ kind: "tool", name: "read_file", icon: "📖", verb: "read", detail: "", ok: true, errorLine: undefined });
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
    const s = reduce({ ...base, entries: [{ kind: "user", text: "x" }], busy: true }, { t: "clear" });
    expect(s).toEqual({ entries: [], streaming: "", busy: false, status: "idle", queued: [] });
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
