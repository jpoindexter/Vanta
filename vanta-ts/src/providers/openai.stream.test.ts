import { describe, it, expect } from "vitest";
import { foldToolCallDeltas, completedToolCalls, type ToolCallDelta } from "./openai.js";

describe("foldToolCallDeltas", () => {
  it("assembles one tool call streamed across deltas (id+name once, args in pieces)", () => {
    const deltas: ToolCallDelta[] = [
      { index: 0, id: "c1", function: { name: "read_file" } },
      { index: 0, function: { arguments: '{"path":' } },
      { index: 0, function: { arguments: '"README.md"}' } },
    ];
    expect(foldToolCallDeltas(deltas)).toEqual([
      { id: "c1", name: "read_file", arguments: { path: "README.md" } },
    ]);
  });

  it("keeps two concurrent tool calls separate by index", () => {
    const deltas: ToolCallDelta[] = [
      { index: 0, id: "a", function: { name: "x", arguments: "{}" } },
      { index: 1, id: "b", function: { name: "y", arguments: '{"k":1}' } },
    ];
    const out = foldToolCallDeltas(deltas);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ id: "b", name: "y", arguments: { k: 1 } });
  });

  it("drops a fragment that never received a name", () => {
    expect(foldToolCallDeltas([{ index: 0, function: { arguments: "{}" } }])).toEqual([]);
  });

  it("falls back to _raw on malformed argument JSON", () => {
    const out = foldToolCallDeltas([{ index: 0, id: "c", function: { name: "t", arguments: "{bad" } }]);
    expect(out[0]?.arguments).toEqual({ _raw: "{bad" });
  });
});

describe("completedToolCalls (mid-stream emission)", () => {
  const d = (index: number, id: string, name: string, args = "{}"): ToolCallDelta => ({ index, id, function: { name, arguments: args } });

  it("emits nothing while only one block has appeared (it may still be streaming)", () => {
    expect(completedToolCalls([d(0, "a", "read_file")], -1)).toEqual({ calls: [], emittedThrough: -1 });
  });

  it("emits block 0 once block 1 begins (block 1 is still the open one)", () => {
    const r = completedToolCalls([d(0, "a", "read_file"), d(1, "b", "grep_files")], -1);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({ id: "a", name: "read_file" });
    expect(r.emittedThrough).toBe(0);
  });

  it("emits all but the last block (0 and 1 when 3 are present)", () => {
    const r = completedToolCalls([d(0, "a", "x"), d(1, "b", "y"), d(2, "c", "z")], -1);
    expect(r.calls.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r.emittedThrough).toBe(1);
  });

  it("never re-emits an already-emitted block (cursor respected)", () => {
    const r = completedToolCalls([d(0, "a", "x"), d(1, "b", "y"), d(2, "c", "z")], 0);
    expect(r.calls.map((c) => c.id)).toEqual(["b"]);
    expect(r.emittedThrough).toBe(1);
  });
});
