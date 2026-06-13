import { describe, it, expect } from "vitest";
import { streamingTail } from "./stream-view.js";

describe("streamingTail — bounds the live region so it can't ghost", () => {
  it("returns at most maxLines lines", () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    expect(streamingTail(text, 80, 6)).toHaveLength(6);
    expect(streamingTail(text, 80, 6)[5]).toBe("line 49"); // keeps the newest
  });
  it("clips each line to the terminal width (no wrapping)", () => {
    const long = "x".repeat(500);
    const [line] = streamingTail(long, 40);
    expect(line!.length).toBeLessThanOrEqual(40);
    expect(line!.endsWith("…")).toBe(true);
  });
  it("passes short text through untouched", () => {
    expect(streamingTail("hi\nthere", 80)).toEqual(["hi", "there"]);
  });
});
