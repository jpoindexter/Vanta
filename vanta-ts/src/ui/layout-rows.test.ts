import { describe, it, expect } from "vitest";
import { BANNER_ROWS, estimateEntryRows, estimateCommittedRows } from "./layout-rows.js";
import type { Entry } from "./types.js";

// Estimator that sizes the bottom-pin spacer. It only needs to be accurate while
// content is short (then the composer floats below the last line at the bottom);
// once committed rows exceed the viewport the spacer clamps to 0 anyway.

describe("BANNER_ROWS", () => {
  it("matches the banner layout (6 wordmark + marginTop + 3 meta + marginBottom)", () => {
    expect(BANNER_ROWS).toBe(11);
  });
});

describe("estimateEntryRows", () => {
  it("user/assistant/note = marginTop + wrapped text rows", () => {
    expect(estimateEntryRows({ kind: "user", text: "hi" }, 80)).toBe(2); // 1 margin + 1 line
    expect(estimateEntryRows({ kind: "assistant", text: "a\nb\nc" }, 80)).toBe(4); // 1 + 3
    expect(estimateEntryRows({ kind: "note", text: "x".repeat(160) }, 80)).toBe(3); // 1 + ceil(160/80)=2
  });

  it("thinking = marginTop + header + capped lines (max 3)", () => {
    expect(estimateEntryRows({ kind: "thinking", text: "one\ntwo" }, 80)).toBe(4); // 2 + 2
    expect(estimateEntryRows({ kind: "thinking", text: "a\nb\nc\nd\ne" }, 80)).toBe(5); // 2 + min(3,5)
  });

  it("tool = head + optional meta + capped diff", () => {
    expect(estimateEntryRows({ kind: "tool", name: "r", verb: "read", detail: "x" }, 80)).toBe(1); // head only
    expect(estimateEntryRows({ kind: "tool", name: "r", verb: "read", detail: "x", summary: "48 lines" }, 80)).toBe(2); // head + meta
    const diff = Array.from({ length: 20 }, () => ({ type: "add" as const, text: "+" }));
    expect(estimateEntryRows({ kind: "tool", name: "w", verb: "wrote", detail: "y", summary: "ok", diff }, 80)).toBe(2 + 12 + 1); // head+meta + 12 shown + "more"
  });

  it("toolGroup = marginTop + sum of its tool rows", () => {
    const e: Entry = { kind: "toolGroup", tools: [
      { kind: "tool", name: "a", verb: "read", detail: "x", summary: "ok" },
      { kind: "tool", name: "b", verb: "ran", detail: "y" },
    ] };
    expect(estimateEntryRows(e, 80)).toBe(1 + 2 + 1); // margin + (head+meta) + head
  });
});

describe("estimateCommittedRows", () => {
  it("is banner alone when there are no entries", () => {
    expect(estimateCommittedRows([], 80)).toBe(BANNER_ROWS);
  });
  it("adds every entry's rows to the banner", () => {
    const entries: Entry[] = [{ kind: "user", text: "q" }, { kind: "assistant", text: "a" }];
    expect(estimateCommittedRows(entries, 80)).toBe(BANNER_ROWS + 2 + 2);
  });
});
