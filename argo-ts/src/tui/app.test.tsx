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
    s = reduce(s, { t: "toolCall", name: "read_file", args: '{"path":"x"}' });
    expect(s.entries).toEqual([
      { kind: "assistant", text: "let me read it" },
      { kind: "tool", name: "read_file", args: '{"path":"x"}' },
    ]);
    expect(s.streaming).toBe("");
    expect(s.status).toBe("read_file");
  });

  it("a tool result fills ok/output on the matching open tool entry", () => {
    let s = reduce(base, { t: "toolCall", name: "read_file", args: "{}" });
    s = reduce(s, { t: "toolResult", name: "read_file", ok: true, output: "# Argo" });
    expect(s.entries[0]).toEqual({ kind: "tool", name: "read_file", args: "{}", ok: true, output: "# Argo" });
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
});
