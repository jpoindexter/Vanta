import { describe, expect, it } from "vitest";
import { detectWakePhrase } from "./wake-detector.js";

describe("detectWakePhrase", () => {
  it("matches punctuation-insensitively and returns the inline command", () => {
    expect(detectWakePhrase("Okay. Hey, Vanta! Open the roadmap.")).toEqual({ matched: true, command: "Open the roadmap." });
  });

  it("opens a second listening turn when only the phrase was spoken", () => {
    expect(detectWakePhrase("Hey Vanta.")).toEqual({ matched: true, command: "" });
  });

  it.each([
    "Hey Santa, set a timer",
    "Hey Fanta, that is enough",
    "The Vanta roadmap is ready",
    "They invented a new assistant",
    "heyy vanta",
    "hey vantastic",
  ])("rejects near and ordinary speech: %s", (speech) => {
    expect(detectWakePhrase(speech).matched).toBe(false);
  });

  it("supports an operator-configured phrase", () => {
    expect(detectWakePhrase("Computer, listen. Draft the note", "computer listen")).toEqual({
      matched: true,
      command: "Draft the note",
    });
  });
});
