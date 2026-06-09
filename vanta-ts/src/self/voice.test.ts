import { describe, it, expect } from "vitest";
import { VOICE_GUIDELINES, voiceTier, detectVoiceAntiPatterns } from "./voice.js";

describe("VOICE_NATURAL", () => {
  it("guidelines mention contractions and no-filler", () => {
    expect(VOICE_GUIDELINES).toContain("contraction");
    expect(VOICE_GUIDELINES).toContain("filler");
  });

  it("voiceTier returns a non-empty prompt section", () => {
    const tier = voiceTier();
    expect(tier).toContain("Voice");
    expect(tier.length).toBeGreaterThan(50);
  });

  it("voiceTier returns empty when disabled", () => {
    expect(voiceTier(false)).toBe("");
  });

  it("detectVoiceAntiPatterns flags filler phrases", () => {
    expect(detectVoiceAntiPatterns("I'd be happy to help you with that.")).toContain("filler phrase detected");
    expect(detectVoiceAntiPatterns("I'd be happy to look into this for you!")).toContain("filler phrase detected");
  });

  it("detectVoiceAntiPatterns flags hype words", () => {
    expect(detectVoiceAntiPatterns("This is an amazing and powerful solution.")).toContain("hype word detected");
  });

  it("detectVoiceAntiPatterns flags hollow openers", () => {
    expect(detectVoiceAntiPatterns("Sure, I can do that.")).toContain("hollow acknowledgment opener");
  });

  it("detectVoiceAntiPatterns returns empty for clean responses", () => {
    expect(detectVoiceAntiPatterns("The test failed because of a missing import.")).toEqual([]);
    expect(detectVoiceAntiPatterns("Done. Here's what changed.")).toEqual([]);
  });
});
