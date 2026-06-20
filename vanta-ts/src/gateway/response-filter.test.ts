import { describe, expect, it } from "vitest";
import { isIntentionalSilence } from "./response-filter.js";

describe("isIntentionalSilence", () => {
  it("returns true when the whole response is exactly NO_REPLY", () => {
    // Arrange
    const reply = "NO_REPLY";
    // Act
    const result = isIntentionalSilence(reply);
    // Assert
    expect(result).toBe(true);
  });

  it("returns true when the whole response is exactly [SILENT]", () => {
    const reply = "[SILENT]";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(true);
  });

  it("returns true when the marker is surrounded only by whitespace", () => {
    const reply = "  \n NO_REPLY \t\n";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(true);
  });

  it("returns false when the marker appears inside normal prose", () => {
    const reply = "I won't say NO_REPLY out loud, but here is the answer.";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });

  it("returns false when prose merely mentions the marker word", () => {
    const reply = "The NO_REPLY token suppresses delivery in group chats.";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });

  it("returns false for a blank response", () => {
    const reply = "";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });

  it("returns false for a whitespace-only response", () => {
    const reply = "   \n\t  ";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });

  it("returns false when the marker is over the 64-char length bound", () => {
    // A marker padded past the bound with internal content is not a clean marker.
    const reply = `NO_REPLY${"x".repeat(70)}`;
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });

  it("returns false for a near-miss marker with different casing", () => {
    const reply = "no_reply";
    const result = isIntentionalSilence(reply);
    expect(result).toBe(false);
  });
});
