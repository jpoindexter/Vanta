import { describe, it, expect } from "vitest";
import { computeDiff } from "./diff.js";

describe("computeDiff", () => {
  it("returns empty for identical content", () => {
    expect(computeDiff("hello\nworld", "hello\nworld")).toEqual([]);
  });

  it("returns all adds for empty before (new file)", () => {
    const d = computeDiff("", "line1\nline2");
    expect(d.every((l) => l.type === "add")).toBe(true);
    expect(d.map((l) => l.text)).toEqual(["line1", "line2"]);
  });

  it("returns all removes for empty after (deleted file)", () => {
    const d = computeDiff("line1\nline2", "");
    expect(d.every((l) => l.type === "remove")).toBe(true);
    expect(d.map((l) => l.text)).toEqual(["line1", "line2"]);
  });

  it("shows a single added line with context", () => {
    const before = "a\nb\nc\nd\ne";
    const after = "a\nb\nnew\nc\nd\ne";
    const d = computeDiff(before, after);
    const types = d.map((l) => l.type);
    expect(types).toContain("add");
    expect(types).toContain("context");
    expect(d.find((l) => l.type === "add")?.text).toBe("new");
  });

  it("shows a single removed line with context", () => {
    const before = "a\nb\nc\nd\ne";
    const after = "a\nb\nd\ne";
    const d = computeDiff(before, after);
    expect(d.some((l) => l.type === "remove" && l.text === "c")).toBe(true);
  });

  it("shows context lines at most 3 lines away from a change", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const after = [...lines];
    after[10] = "CHANGED";
    const d = computeDiff(lines.join("\n"), after.join("\n"));
    const contextTexts = d.filter((l) => l.type === "context").map((l) => l.text);
    // Should contain line7..line9 and line11..line13, but not line0
    expect(contextTexts).toContain("line7");
    expect(contextTexts).not.toContain("line0");
  });

  it("separates distant change hunks with a ··· marker", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const bLines = before.split("\n");
    const aLines = [...bLines];
    aLines[1] = "CHANGED_A";
    aLines[18] = "CHANGED_B";
    const d = computeDiff(bLines.join("\n"), aLines.join("\n"));
    expect(d.some((l) => l.type === "context" && l.text === "···")).toBe(true);
  });

  it("returns empty for files over MAX_LINES", () => {
    const big = Array.from({ length: 401 }, (_, i) => `line${i}`).join("\n");
    expect(computeDiff(big, big + "\nextra")).toEqual([]);
  });

  it("handles a multi-line replacement", () => {
    const d = computeDiff("foo\nbar\nbaz", "foo\nQUX\nbaz");
    const removes = d.filter((l) => l.type === "remove");
    const adds = d.filter((l) => l.type === "add");
    expect(removes.some((l) => l.text === "bar")).toBe(true);
    expect(adds.some((l) => l.text === "QUX")).toBe(true);
  });
});
