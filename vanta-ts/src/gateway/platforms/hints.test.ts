import { describe, it, expect } from "vitest";
import { platformHint } from "./hints.js";

describe("platformHint", () => {
  it("returns a plain-text hint for IRC that warns markdown does not render", () => {
    const hint = platformHint("irc");
    expect(hint).toBeDefined();
    expect(hint).toContain("IRC");
    expect(hint!.toLowerCase()).toContain("no markdown");
  });

  it("returns a markdown-capable hint for Telegram (MarkdownV2 supported)", () => {
    const hint = platformHint("telegram");
    expect(hint).toBeDefined();
    expect(hint).toContain("MarkdownV2");
  });

  it("gives a different hint for IRC than for Telegram", () => {
    expect(platformHint("irc")).not.toBe(platformHint("telegram"));
  });

  it("returns undefined for an unknown platform id", () => {
    expect(platformHint("nosuchplatform")).toBeUndefined();
  });

  it("returns undefined when no platform is given (default = no hint)", () => {
    expect(platformHint()).toBeUndefined();
    expect(platformHint("")).toBeUndefined();
  });

  it("matches an id case-insensitively and trims surrounding whitespace", () => {
    expect(platformHint("  IRC  ")).toBe(platformHint("irc"));
  });
});
