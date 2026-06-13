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

  it("does not commit an empty assistant turn", () => {
    const s = run([{ t: "turnStart" }, { t: "turnEnd" }]);
    expect(s.entries).toHaveLength(0);
  });

  it("keeps an in-flight tool in the live region (not committed) until its result", () => {
    const s = run([{ t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" }]);
    expect(s.entries).toHaveLength(0); // <Static> never repaints — commit only when done
    expect(s.activeTools).toEqual([{ name: "read_file", verb: "read", detail: "x.ts" }]);
  });

  it("commits the completed tool entry on result and clears activeTools", () => {
    const s = run([
      { t: "toolCall", name: "read_file", verb: "read", detail: "x.ts" },
      { t: "toolResult", name: "read_file", ok: true, summary: "48 lines" },
    ]);
    expect(s.activeTools).toHaveLength(0);
    expect(s.entries[0]).toMatchObject({ kind: "tool", name: "read_file", verb: "read", detail: "x.ts", ok: true, summary: "48 lines" });
  });

  it("records an error line for a failed tool", () => {
    const s = run([
      { t: "toolCall", name: "shell_cmd", verb: "ran", detail: "x" },
      { t: "toolResult", name: "shell_cmd", ok: false, errorLine: "boom" },
    ]);
    expect(s.entries[0]).toMatchObject({ ok: false, errorLine: "boom" });
  });

  it("carries a diff through to the committed tool entry", () => {
    const diff = [{ type: "add" as const, text: "new line" }];
    const s = run([
      { t: "toolCall", name: "write_file", verb: "wrote", detail: "y.ts" },
      { t: "toolResult", name: "write_file", ok: true, diff },
    ]);
    expect((s.entries[0] as { diff?: unknown }).diff).toEqual(diff);
  });

  it("replaces the todo list on a todos action", () => {
    const items = [{ text: "ship slice 4", status: "in_progress" as const }];
    const s = run([{ t: "todos", items }]);
    expect(s.todos).toEqual(items);
  });
});
