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

  // A long turn used to render one row per write — eleven of them buried the
  // composer. Consecutive same-tool successes collapse to one counted row.
  it("collapses a run of consecutive edits into one counted row", () => {
    const edit = (file: string) => ({ label: `✓ edit_file: ${file}`, kind: "tool_end" as const, name: "edit_file", ok: true });
    const groups = compactTrace([edit("app-body.tsx"), edit("app-body.tsx"), edit("app-body.tsx"), edit("app.tsx")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("✓ edit_file: app-body.tsx ×4");
    expect(groups[0]?.evidence).toHaveLength(4); // every original stays available
  });

  it("never merges a failure into a success run", () => {
    const groups = compactTrace([
      { label: "✓ edit_file: a", kind: "tool_end", name: "edit_file", ok: true },
      { label: "✗ edit_file: old_string not found", kind: "tool_end", name: "edit_file", ok: false },
      { label: "✓ edit_file: b", kind: "tool_end", name: "edit_file", ok: true },
    ]);
    expect(groups.map((group) => group.status)).toEqual(["done", "attention", "done"]);
  });

  it("keeps a non-adjacent repeat as its own step", () => {
    const groups = compactTrace([
      { label: "✓ todo: plan updated", kind: "tool_end", name: "todo", ok: true },
      { label: "✓ write_file: queue-panel.tsx", kind: "tool_end", name: "write_file", ok: true },
      { label: "✓ todo: plan updated", kind: "tool_end", name: "todo", ok: true },
    ]);
    expect(groups).toHaveLength(3); // separate moments in the turn, not a run
    expect(groups.every((group) => !group.label.includes("×"))).toBe(true);
  });

  it("leaves a lone call uncounted", () => {
    const groups = compactTrace([{ label: "✓ write_file: x", kind: "tool_end", name: "write_file", ok: true }]);
    expect(groups[0]?.label).toBe("✓ write_file: x");
  });
});
