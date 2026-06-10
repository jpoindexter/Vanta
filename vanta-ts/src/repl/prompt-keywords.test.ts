import { describe, it, expect } from "vitest";
import { classifyPromptKeyword, CONTINUE_NUDGE } from "./prompt-keywords.js";

describe("classifyPromptKeyword", () => {
  it("classifies each bare continuation phrase as continue", () => {
    for (const p of ["keep going", "continue", "go on", "proceed", "keep at it", "carry on"]) {
      expect(classifyPromptKeyword(p)).toBe("continue");
    }
  });

  it("classifies each bare negative phrase as stop", () => {
    for (const p of ["stop", "never mind", "nevermind", "cancel that", "forget it"]) {
      expect(classifyPromptKeyword(p)).toBe("stop");
    }
  });

  it("tolerates a single trailing punctuation mark", () => {
    expect(classifyPromptKeyword("keep going!")).toBe("continue");
    expect(classifyPromptKeyword("continue.")).toBe("continue");
    expect(classifyPromptKeyword("stop?")).toBe("stop");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(classifyPromptKeyword("  KEEP GOING  ")).toBe("continue");
    expect(classifyPromptKeyword("Proceed")).toBe("continue");
    expect(classifyPromptKeyword("STOP")).toBe("stop");
  });

  it("does NOT trigger when the phrase is embedded in a longer instruction", () => {
    expect(classifyPromptKeyword("keep going on the refactor")).toBeNull();
    expect(classifyPromptKeyword("please continue the work")).toBeNull();
    expect(classifyPromptKeyword("stop the server")).toBeNull();
  });

  it("returns null for unrelated text", () => {
    expect(classifyPromptKeyword("what is the capital of France")).toBeNull();
    expect(classifyPromptKeyword("")).toBeNull();
  });

  it("exposes the continuation nudge text", () => {
    expect(CONTINUE_NUDGE).toMatch(/previous task/i);
  });
});
