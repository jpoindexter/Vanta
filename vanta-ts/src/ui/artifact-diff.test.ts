import { describe, it, expect } from "vitest";
import { diffArtifact } from "./artifact-diff.js";

describe("diffArtifact", () => {
  it("marks every line added for a brand-new artifact", () => {
    const d = diffArtifact("", "line one\nline two");
    expect(d.isNew).toBe(true);
    expect(d.unchanged).toBe(false);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
    expect(d.lines.every((l) => l.kind === "added")).toBe(true);
    expect(d.lines.map((l) => l.text)).toEqual(["line one", "line two"]);
  });

  it("reports unchanged with no lines for identical content", () => {
    const d = diffArtifact("same\ntext", "same\ntext");
    expect(d.unchanged).toBe(true);
    expect(d.lines).toEqual([]);
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });

  it("classifies a one-line edit as one removed + one added, keeping context", () => {
    const oldText = "alpha\nbeta\ngamma";
    const newText = "alpha\nBETA\ngamma";
    const d = diffArtifact(oldText, newText);
    expect(d.isNew).toBe(false);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    const removed = d.lines.filter((l) => l.kind === "removed").map((l) => l.text);
    const added = d.lines.filter((l) => l.kind === "added").map((l) => l.text);
    expect(removed).toEqual(["beta"]);
    expect(added).toEqual(["BETA"]);
    // unchanged neighbours survive as context
    const context = d.lines.filter((l) => l.kind === "context").map((l) => l.text);
    expect(context).toContain("alpha");
    expect(context).toContain("gamma");
  });

  it("counts pure additions appended to an existing file", () => {
    const d = diffArtifact("one\ntwo", "one\ntwo\nthree\nfour");
    expect(d.isNew).toBe(false);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(0);
    expect(d.lines.filter((l) => l.kind === "added").map((l) => l.text)).toEqual(["three", "four"]);
  });

  it("counts a pure deletion", () => {
    const d = diffArtifact("keep\ndrop\nkeep2", "keep\nkeep2");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(1);
    expect(d.lines.filter((l) => l.kind === "removed").map((l) => l.text)).toEqual(["drop"]);
  });
});
