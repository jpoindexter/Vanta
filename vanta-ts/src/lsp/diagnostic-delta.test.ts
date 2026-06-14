import { describe, it, expect } from "vitest";
import type { Diag } from "./diagnostic-delta.js";
import { diffDiagnostics, formatNewDiagnostics } from "./diagnostic-delta.js";

const err = (line: number, message: string): Diag => ({ line, message, category: "error" });
const warn = (line: number, message: string): Diag => ({ line, message, category: "warning" });

describe("diffDiagnostics", () => {
  it("filters a pre-existing diagnostic present in both before and after", () => {
    const baseline = err(3, "unused variable 'x'");
    const news = diffDiagnostics([baseline], [baseline]);
    expect(news).toEqual([]);
  });

  it("surfaces a genuinely new diagnostic absent from the baseline", () => {
    const before = [err(3, "unused variable 'x'")];
    const after = [err(3, "unused variable 'x'"), err(7, "Type 'string' is not assignable to type 'number'.")];
    const news = diffDiagnostics(before, after);
    expect(news).toEqual([err(7, "Type 'string' is not assignable to type 'number'.")]);
  });

  it("treats a line-shifted same-message diagnostic as baseline, not new", () => {
    // The edit added lines above, pushing the pre-existing error from L3 to L12.
    const before = [err(3, "unused variable 'x'")];
    const after = [err(12, "unused variable 'x'")];
    expect(diffDiagnostics(before, after)).toEqual([]);
  });

  it("keys on category too: same message at a new category is new", () => {
    const before = [err(1, "shadowed name")];
    const after = [warn(1, "shadowed name")];
    expect(diffDiagnostics(before, after)).toEqual([warn(1, "shadowed name")]);
  });

  it("ignores multiset counts: before-once + after-twice → both baseline", () => {
    const before = [err(1, "dup")];
    const after = [err(1, "dup"), err(9, "dup")];
    expect(diffDiagnostics(before, after)).toEqual([]);
  });

  it("empty before → every after diagnostic is new (new file)", () => {
    const after = [err(1, "a"), warn(2, "b")];
    expect(diffDiagnostics([], after)).toEqual(after);
  });

  it("empty after → nothing new", () => {
    expect(diffDiagnostics([err(1, "a")], [])).toEqual([]);
  });

  it("both empty → nothing new", () => {
    expect(diffDiagnostics([], [])).toEqual([]);
  });
});

describe("formatNewDiagnostics", () => {
  it("returns empty string when there are no new diagnostics", () => {
    expect(formatNewDiagnostics([])).toBe("");
  });

  it("formats a single new diagnostic with line, category, and message", () => {
    const note = formatNewDiagnostics([err(12, "cannot find name 'foo'")]);
    expect(note).toBe("\n⚠ 1 new diagnostic(s) from this edit:\n  L12 error: cannot find name 'foo'");
  });

  it("formats multiple diagnostics, one per line, with the count in the header", () => {
    const note = formatNewDiagnostics([err(12, "bad type"), warn(20, "deprecated")]);
    expect(note).toContain("⚠ 2 new diagnostic(s) from this edit:");
    expect(note).toContain("  L12 error: bad type");
    expect(note).toContain("  L20 warning: deprecated");
    expect(note.split("\n").length).toBe(4); // leading "" + header + 2 lines
  });
});
