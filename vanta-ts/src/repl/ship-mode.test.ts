import { describe, it, expect } from "vitest";
import { buildShipPrompt, isInShipMode, extractShipTarget, buildShipNote } from "./ship-mode.js";

describe("ship-mode", () => {
  it("buildShipPrompt contains the target and SHIP-MODE marker", () => {
    const prompt = buildShipPrompt("EF-TASKSTACK");
    expect(prompt).toContain("[SHIP-MODE]");
    expect(prompt).toContain("EF-TASKSTACK");
    expect(prompt).toContain("ship");
  });

  it("isInShipMode detects active ship mode", () => {
    const prompt = buildShipPrompt("my-feature");
    expect(isInShipMode(prompt)).toBe(true);
    expect(isInShipMode("normal system prompt")).toBe(false);
  });

  it("extractShipTarget returns the target from the prompt", () => {
    const prompt = buildShipPrompt("VANTA-LINKS");
    expect(extractShipTarget(prompt)).toBe("VANTA-LINKS");
  });

  it("extractShipTarget returns null when not in ship mode", () => {
    expect(extractShipTarget("no ship mode here")).toBeNull();
  });

  it("buildShipNote mentions the target", () => {
    const note = buildShipNote("my-card");
    expect(note).toContain("my-card");
    expect(note).toContain("⚓");
  });
});
