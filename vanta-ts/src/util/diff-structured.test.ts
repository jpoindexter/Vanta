import { describe, it, expect } from "vitest";
import { lineMark, groupHunks, diffStat, summarizeFiles, formatFileList, renderDiffText } from "./diff-structured.js";
import type { DiffLine } from "./diff.js";

// VANTA-STRUCTURED-DIFF — hunk grouping, per-file stat, colorized render model.

const D = (over: Partial<DiffLine> & { type: DiffLine["type"] }): DiffLine => ({ text: over.text ?? "x", type: over.type });

describe("lineMark", () => {
  it("maps line types to gutter marks", () => {
    expect(lineMark(D({ type: "add", text: "new" }))).toEqual({ mark: "+", text: "new" });
    expect(lineMark(D({ type: "remove", text: "old" }))).toEqual({ mark: "-", text: "old" });
    expect(lineMark(D({ type: "context", text: "keep" }))).toEqual({ mark: " ", text: "keep" });
    expect(lineMark(D({ type: "context", text: "···" }))).toEqual({ mark: "…", text: "" });
  });
});

describe("groupHunks", () => {
  it("splits on ··· separators, dropping context-only segments and counting ±", () => {
    const lines: DiffLine[] = [
      D({ type: "context", text: "a" }),
      D({ type: "add", text: "b" }),
      D({ type: "remove", text: "c" }),
      D({ type: "context", text: "···" }),
      D({ type: "context", text: "d" }),
      D({ type: "add", text: "e" }),
    ];
    const hunks = groupHunks(lines);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ adds: 1, removes: 1 });
    expect(hunks[1]).toMatchObject({ adds: 1, removes: 0 });
  });

  it("a context-only diff yields no hunks", () => {
    expect(groupHunks([D({ type: "context", text: "a" }), D({ type: "context", text: "···" })])).toEqual([]);
  });
});

describe("diffStat", () => {
  it("counts adds and removes", () => {
    expect(diffStat([D({ type: "add" }), D({ type: "add" }), D({ type: "remove" }), D({ type: "context" })])).toEqual({ adds: 2, removes: 1 });
  });
});

describe("summarizeFiles / formatFileList", () => {
  it("summarizes only changed files with ± + hunk counts", () => {
    const files = [
      { path: "a.ts", before: "one\ntwo\nthree", after: "one\nTWO\nthree" },
      { path: "unchanged.ts", before: "same", after: "same" },
      { path: "new.ts", before: "", after: "hello" },
    ];
    const sum = summarizeFiles(files);
    expect(sum.map((f) => f.path)).toEqual(["a.ts", "new.ts"]); // unchanged omitted
    expect(sum[0]).toMatchObject({ adds: 1, removes: 1 });
    const list = formatFileList(sum);
    expect(list).toContain("a.ts  +1 -1");
    expect(list).toContain("new.ts  +1 -0");
  });

  it("empty when nothing changed", () => {
    expect(formatFileList(summarizeFiles([{ path: "x", before: "s", after: "s" }]))).toBe("(no changes)");
  });
});

describe("renderDiffText", () => {
  it("renders gutter marks and collapses separators", () => {
    const out = renderDiffText([D({ type: "add", text: "n" }), D({ type: "remove", text: "o" }), D({ type: "context", text: "···" })]);
    expect(out).toContain("+ n");
    expect(out).toContain("- o");
    expect(out).toContain("⋯");
  });
});
