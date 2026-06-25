import { describe, it, expect } from "vitest";
import { streamingTail, tailWindow } from "./stream-view.js";

describe("streamingTail — wraps (never clips) within a bounded window", () => {
  it("returns at most maxLines wrapped lines, keeping the newest", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    expect(streamingTail(text, 80, 6)).toHaveLength(6);
    expect(streamingTail(text, 80, 6)[5]).toBe("line 49");
  });
  it("WRAPS a long line to the width with no truncation/ellipsis", () => {
    const long = `${"word ".repeat(40)}`.trim(); // ~200 chars of real words
    const lines = streamingTail(long, 40, 50);
    expect(lines.every((l) => l.length <= 38)).toBe(true); // each wrapped line fits (cols-2)
    expect(lines.some((l) => l.includes("…"))).toBe(false); // never truncates
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe(long); // no content lost
  });
  it("hard-breaks a single word longer than the width", () => {
    const lines = streamingTail("x".repeat(100), 40, 50);
    expect(lines.every((l) => l.length <= 38)).toBe(true);
    expect(lines.join("")).toBe("x".repeat(100)); // nothing dropped
  });
  it("passes short lines through untouched", () => {
    expect(streamingTail("hi\nthere", 80)).toEqual(["hi", "there"]);
  });
  it("tailWindow grows with the viewport but stays bounded", () => {
    expect(tailWindow(24)).toBe(14);
    expect(tailWindow(100)).toBe(20); // capped
    expect(tailWindow(12)).toBe(8); // floor
  });
});
