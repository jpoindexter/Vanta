import { describe, expect, it } from "vitest";
import { compactTrace } from "./quiet-trace.js";

describe("compactTrace", () => {
  it("collapses repeated reads and searches behind one receipt", () => {
    const groups = compactTrace([
      { label: "→ read_file", kind: "tool_start", name: "read_file" },
      { label: "✓ read_file: a", kind: "tool_end", name: "read_file", ok: true, detail: "a" },
      { label: "✓ grep_files: b", kind: "tool_end", name: "grep_files", ok: true, detail: "b" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toContain("Read and searched 2 times");
    expect(groups[0]?.evidence).toHaveLength(2);
  });

  it("shows only the latest active sentence while preserving completed work", () => {
    const groups = compactTrace([
      { label: "→ read_file", kind: "tool_start", name: "read_file" },
      { label: "→ grep_files", kind: "tool_start", name: "grep_files" },
      { label: "✓ write_file: changed", kind: "tool_end", name: "write_file", ok: true },
    ]);
    expect(groups.filter((group) => group.status === "active")).toEqual([expect.objectContaining({ label: "→ grep_files" })]);
    expect(groups).toContainEqual(expect.objectContaining({ label: "✓ write_file: changed", status: "done" }));
  });

  it("keeps the exact failed evidence visible and drops internal note chatter", () => {
    const groups = compactTrace([
      { label: "note: policy narration", kind: "note", detail: "policy narration" },
      { label: "✗ shell_cmd: permission denied", kind: "tool_end", name: "shell_cmd", ok: false, detail: "permission denied" },
    ]);
    expect(groups).toEqual([{ label: "✗ shell_cmd: permission denied", status: "attention", evidence: [expect.objectContaining({ detail: "permission denied" })] }]);
  });
});
