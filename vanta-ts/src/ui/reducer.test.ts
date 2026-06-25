import { describe, it, expect } from "vitest";
import { reduce, type Action } from "./reducer.js";
import { initialState, type UiState } from "./types.js";

const run = (actions: Action[]): UiState => actions.reduce(reduce, initialState);

describe("ui reducer — Claude-method commit model", () => {
  it("appends a user entry on submit", () => {
    const s = run([{ t: "submit", text: "hi" }]);
    expect(s.entries).toEqual([{ kind: "user", text: "hi" }]);
  });

  it("accumulates streaming deltas in the live region (not committed)", () => {
    const s = run([{ t: "turnStart" }, { t: "delta", d: "Hel" }, { t: "delta", d: "lo" }]);
    expect(s.streaming).toBe("Hello");
    expect(s.entries).toHaveLength(0); // not committed until turnEnd
    expect(s.busy).toBe(true);
  });

  it("commits streamed text to history and clears the live region on turnEnd", () => {
    const s = run([{ t: "turnStart" }, { t: "delta", d: "done." }, { t: "turnEnd" }]);
    expect(s.streaming).toBe("");
    expect(s.busy).toBe(false);
    expect(s.entries).toEqual([{ kind: "assistant", text: "done." }]);
  });

  it("drains COMPLETE paragraphs into <Static> as they stream (flows up), keeping the in-progress one live", () => {
    const s = run([
      { t: "submit", text: "go" },
      { t: "turnStart" },
      { t: "delta", d: "para one.\n\n" }, // complete → commits (first chunk, gets ⏺)
      { t: "delta", d: "para two.\n\n" }, // complete → commits as a continuation (no marker)
      { t: "delta", d: "para three (in progress)" }, // no boundary → stays live
    ]);
    expect(s.entries).toEqual([
      { kind: "user", text: "go" },
      { kind: "assistant", text: "para one." },
      { kind: "assistant", text: "para two.", cont: true },
    ]);
    expect(s.streaming).toBe("para three (in progress)");
  });

  it("commits the trailing paragraph as a continuation on turnEnd", () => {
    const s = run([
      { t: "submit", text: "go" },
      { t: "turnStart" },
      { t: "delta", d: "first.\n\n" },
      { t: "delta", d: "last." },
      { t: "turnEnd" },
    ]);
    expect(s.entries).toEqual([
      { kind: "user", text: "go" },
      { kind: "assistant", text: "first." },
      { kind: "assistant", text: "last.", cont: true },
    ]);
    expect(s.streaming).toBe("");
  });

  it("never splits a code fence that contains a blank line (no unbalanced ``` entries)", () => {
    const reply = "Intro:\n\n```python\ndef foo():\n    pass\n\ndef bar():\n    pass\n```\n\nDone.";
    const chunks = reply.match(/[\s\S]{1,5}/g) ?? [];
    const s = run([
      { t: "submit", text: "go" },
      { t: "turnStart" },
      ...chunks.map((c): Action => ({ t: "delta", d: c })),
      { t: "turnEnd" },
    ]);
    const assistants = s.entries.filter((e): e is Extract<typeof e, { kind: "assistant" }> => e.kind === "assistant");
    // every committed assistant chunk has balanced fences (the code block stays whole)
    for (const e of assistants) expect((e.text.match(/```/g) ?? []).length % 2).toBe(0);
    // and the full reply is preserved across the chunks
    expect(assistants.map((e) => e.text).join("\n\n")).toContain("```python\ndef foo():\n    pass\n\ndef bar():\n    pass\n```");
  });

  it("closes a dangling code fence on turnEnd (no broken half-fence in scrollback)", () => {
    const s = run([
      { t: "submit", text: "go" },
      { t: "turnStart" },
      { t: "delta", d: "```js\nlet x = 1" }, // turn ends mid-fence (truncation/abort)
      { t: "turnEnd" },
    ]);
    const a = s.entries.find((e): e is Extract<typeof e, { kind: "assistant" }> => e.kind === "assistant")!;
    expect((a.text.match(/```/g) ?? []).length % 2).toBe(0); // balanced — fence was closed
    expect(a.text.endsWith("```")).toBe(true);
  });

  it("keeps text→tool→text order when text streams after a tool call (no mid-flight reorder)", () => {
    const s = run([
      { t: "submit", text: "go" },
      { t: "turnStart" },
      { t: "delta", d: "Plan.\n\n" }, // commits "Plan." (no tool buffered yet)
      { t: "toolCall", verb: "run", name: "shell_cmd", detail: "" },
      { t: "delta", d: "After.\n\n" }, // streams during the tool run — must NOT jump ahead
      { t: "toolResult", name: "shell_cmd", ok: true },
      { t: "turnEnd" },
    ]);
    // text after the tool stays AFTER the tool group, not merged before it
    expect(s.entries.map((e) => e.kind)).toEqual(["user", "assistant", "toolGroup", "assistant"]);
  });

  it("does not commit an empty assistant turn", () => {
    const s = run([{ t: "turnStart" }, { t: "turnEnd" }]);
    expect(s.entries).toHaveLength(0);
  });

  it("commits streamed text to history the moment a tool call interrupts it (anti-ghost)", () => {
    const s = run([
      { t: "turnStart" },
      { t: "delta", d: "Here is the plan." },
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "x.html" },
    ]);
    expect(s.streaming).toBe(""); // text left the redrawing live region
    expect(s.entries).toEqual([{ kind: "assistant", text: "Here is the plan." }]);
    expect(s.activeTools).toEqual([{ name: "write_file", verb: "wrote", detail: "x.html" }]);
  });

  it("orders committed text before the tool group and never duplicates it on turnEnd", () => {
    const s = run([
      { t: "turnStart" },
      { t: "delta", d: "Writing it now." },
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "x.html" },
      { t: "toolResult", name: "write_file", ok: true, summary: "+6/-0" },
      { t: "turnEnd" },
    ]);
    expect(s.entries).toHaveLength(2); // text once, then the group — no duplicate
    expect(s.entries[0]).toEqual({ kind: "assistant", text: "Writing it now." });
    expect(s.entries[1]).toMatchObject({ kind: "toolGroup" });
    expect(s.streaming).toBe("");
  });

  it("keeps an in-flight tool in the live region (not committed) until its result", () => {
    const s = run([{ t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" }]);
    expect(s.entries).toHaveLength(0); // <Static> never repaints — commit only when done
    expect(s.activeTools).toEqual([{ name: "read_file", verb: "read", detail: "x.ts" }]);
  });

  it("buffers a completed tool into pendingGroup (not committed until a flush)", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true, summary: "48 lines" },
    ]);
    expect(s.activeTools).toHaveLength(0);
    expect(s.entries).toHaveLength(0); // not yet flushed
    expect(s.pendingGroup[0]).toMatchObject({ kind: "tool", name: "read_file", verb: "read", ok: true, summary: "48 lines" });
  });

  it("flushes a run of tools into one toolGroup on turnEnd", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true, summary: "48 lines" },
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "y.ts" },
      { t: "toolResult", name: "write_file", ok: true, summary: "+6/-0" },
      { t: "turnEnd" },
    ]);
    expect(s.pendingGroup).toHaveLength(0);
    const group = s.entries.find((e) => e.kind === "toolGroup");
    expect(group).toMatchObject({ kind: "toolGroup" });
    expect((group as { tools: unknown[] }).tools).toHaveLength(2);
  });

  it("flushes the group before a user turn / thinking", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true },
      { t: "submit", text: "next" },
    ]);
    expect(s.entries[0]).toMatchObject({ kind: "toolGroup" });
    expect(s.entries[1]).toEqual({ kind: "user", text: "next" });
  });

  it("records an error line on the buffered tool", () => {
    const s = run([
      { t: "toolCall", name: "shell_cmd", verb: "ran", detail: "x" },
      { t: "toolResult", name: "shell_cmd", ok: false, errorLine: "boom" },
    ]);
    expect(s.pendingGroup[0]).toMatchObject({ ok: false, errorLine: "boom" });
  });

  it("carries a diff through to the buffered tool", () => {
    const diff = [{ type: "add" as const, text: "new line" }];
    const s = run([
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "y.ts" },
      { t: "toolResult", name: "write_file", ok: true, diff },
    ]);
    expect(s.pendingGroup[0]!.diff).toEqual(diff);
  });

  it("replaces the todo list on a todos action", () => {
    const items = [{ text: "ship slice 4", status: "in_progress" as const }];
    const s = run([{ t: "todos", items }]);
    expect(s.todos).toEqual(items);
  });

  it("enqueues and dequeues messages FIFO", () => {
    const q = run([{ t: "enqueue", text: "first" }, { t: "enqueue", text: "second" }]);
    expect(q.queued).toEqual(["first", "second"]);
    const d = reduce(q, { t: "dequeue" });
    expect(d.queued).toEqual(["second"]);
  });

  it("carries tokens onto the buffered tool entry in pendingGroup", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true, summary: "48 lines", tokens: 200 },
    ]);
    expect(s.pendingGroup[0]).toMatchObject({ kind: "tool", name: "read_file", tokens: 200 });
  });

  it("preserves tokens on each tool after a group flush to history", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true, tokens: 100 },
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "y.ts" },
      { t: "toolResult", name: "write_file", ok: true, tokens: 50 },
      { t: "turnEnd" },
    ]);
    const group = s.entries.find((e) => e.kind === "toolGroup") as { kind: "toolGroup"; tools: { tokens?: number }[] } | undefined;
    expect(group?.tools[0]?.tokens).toBe(100);
    expect(group?.tools[1]?.tokens).toBe(50);
  });
});
