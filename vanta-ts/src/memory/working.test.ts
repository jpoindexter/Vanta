import { describe, it, expect } from "vitest";
import { SessionWorkingMemory } from "./working.js";

describe("SessionWorkingMemory", () => {
  it("starts empty", () => {
    const wm = new SessionWorkingMemory();
    expect(wm.isEmpty()).toBe(true);
    expect(wm.size()).toBe(0);
    expect(wm.format()).toBe("");
  });

  it("adds items and formats them", () => {
    const wm = new SessionWorkingMemory();
    wm.add("user prefers OpenAI");
    wm.add("current goal is to ship EF-SCOPEDELTA");
    expect(wm.isEmpty()).toBe(false);
    expect(wm.size()).toBe(2);
    const f = wm.format();
    expect(f).toContain("Working memory");
    expect(f).toContain("1. user prefers OpenAI");
    expect(f).toContain("2. current goal");
  });

  it("trims whitespace on add", () => {
    const wm = new SessionWorkingMemory();
    wm.add("  padded note  ");
    expect(wm.getAll()[0]).toBe("padded note");
  });

  it("ignores empty adds", () => {
    const wm = new SessionWorkingMemory();
    wm.add("");
    wm.add("   ");
    expect(wm.isEmpty()).toBe(true);
  });

  it("pop removes the last item", () => {
    const wm = new SessionWorkingMemory();
    wm.add("first");
    wm.add("second");
    const popped = wm.pop();
    expect(popped).toBe("second");
    expect(wm.size()).toBe(1);
  });
});
