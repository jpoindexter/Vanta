import { describe, it, expect } from "vitest";
import { parseDecisions, detectConflict } from "./decision-guard.js";

const SAMPLE_DECISIONS = `# DECISIONS.md

## 2026-06-01 — Use Rust for the kernel

Choice: Rust, zero deps
Why: Safety and performance at the OS boundary. No GC pauses near I/O.
Alternatives: Go, C++

## 2026-06-02 — Non-streaming providers

Choice: Non-streaming in v0
Why: The loop waits for full tool calls anyway; streaming is a display concern.
`;

describe("parseDecisions", () => {
  it("parses entries from DECISIONS.md format", () => {
    const entries = parseDecisions(SAMPLE_DECISIONS);
    expect(entries.length).toBe(2);
    expect(entries[0]!.title).toContain("Rust");
    expect(entries[0]!.choice).toBe("Rust, zero deps");
    expect(entries[0]!.why).toContain("Safety");
  });

  it("returns empty array for empty content", () => {
    expect(parseDecisions("")).toEqual([]);
    expect(parseDecisions("# No decisions yet")).toEqual([]);
  });
});

describe("detectConflict", () => {
  const decisions = parseDecisions(SAMPLE_DECISIONS);

  it("returns null for unrelated messages", () => {
    expect(detectConflict("let's add a new tool for images", decisions)).toBeNull();
    expect(detectConflict("what time is it?", decisions)).toBeNull();
  });

  it("returns null when keywords match but no reconsider signal", () => {
    // Mentions Rust but not reconsidering it
    expect(detectConflict("the Rust kernel looks good", decisions)).toBeNull();
  });

  it("flags a conflict when keywords + reconsider signal match", () => {
    const conflict = detectConflict("why not switch the kernel to Go instead of Rust", decisions);
    expect(conflict).not.toBeNull();
    expect(conflict).toContain("Rust");
  });

  it("flags streaming reconsideration", () => {
    const conflict = detectConflict("can we change to streaming providers instead", decisions);
    expect(conflict).not.toBeNull();
  });

  it("includes the why in the conflict note", () => {
    const conflict = detectConflict("why not switch the kernel to Go instead of Rust", decisions);
    expect(conflict).toContain("Safety");
  });
});
