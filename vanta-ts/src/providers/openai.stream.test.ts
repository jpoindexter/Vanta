import { describe, it, expect } from "vitest";
import { foldToolCallDeltas, type ToolCallDelta } from "./openai.js";

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
