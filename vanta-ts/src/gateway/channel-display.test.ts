import { describe, it, expect } from "vitest";
import {
  formatChannelMessage,
  channelMessagePrefix,
  sanitizeForLine,
  DEFAULT_TEXT_MAX,
} from "./channel-display.js";

const ESC = "\x1b";

describe("channelMessagePrefix", () => {
  it("returns the glyph + label for a known platform", () => {
    expect(channelMessagePrefix("telegram")).toBe("📨 telegram");
    expect(channelMessagePrefix("discord")).toBe("🎮 discord");
  });

  it("is case-insensitive on the platform id", () => {
    expect(channelMessagePrefix("TELEGRAM")).toBe("📨 telegram");
  });

  it("falls back to the generic glyph + id for an unknown platform", () => {
    expect(channelMessagePrefix("weirdnet")).toBe("📨 weirdnet");
  });

  it("renders a generic 'channel' label when the platform id is blank", () => {
    expect(channelMessagePrefix("")).toBe("📨 channel");
    expect(channelMessagePrefix("   ")).toBe("📨 channel");
  });

  it("sanitizes escape injection in the platform id", () => {
    expect(channelMessagePrefix(`evil${ESC}[31m`)).toBe("📨 evil");
  });
});

describe("sanitizeForLine", () => {
  it("collapses newlines, tabs and carriage returns to single spaces", () => {
    expect(sanitizeForLine("a\nb\tc\r\nd")).toBe("a b c d");
  });

  it("strips ANSI SGR (color) sequences", () => {
    expect(sanitizeForLine(`${ESC}[31mred${ESC}[0m`)).toBe("red");
  });

  it("strips a BEL-terminated OSC (set-title) sequence", () => {
    expect(sanitizeForLine(`a${ESC}]0;pwned\x07b`)).toBe("ab");
  });

  it("strips an ST-terminated OSC sequence", () => {
    expect(sanitizeForLine(`a${ESC}]0;pwned${ESC}\\b`)).toBe("ab");
  });

  it("strips an ESC + printable as a 2-char escape sequence", () => {
    // ESC followed by a printable is a leftover 2-char escape (e.g. ESC c reset);
    // both are consumed, leaving the surrounding text.
    expect(sanitizeForLine(`a${ESC}cb`)).toBe("ab");
  });

  it("strips a trailing lone ESC byte (no following byte)", () => {
    // A dangling ESC has no second byte to pair with, so it falls through to the
    // control-char pass and is removed entirely.
    expect(sanitizeForLine(`ab${ESC}`)).toBe("ab");
  });

  it("strips C1 control chars", () => {
    expect(sanitizeForLine("abc")).toBe("a b c");
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeForLine("  hello  ")).toBe("hello");
  });

  it("leaves clean text untouched", () => {
    expect(sanitizeForLine("hello world")).toBe("hello world");
  });
});

describe("formatChannelMessage", () => {
  it("renders platform + sender + text on one line", () => {
    expect(formatChannelMessage({ text: "hi there", from: "alice" }, "telegram")).toBe(
      "📨 telegram @alice: hi there",
    );
  });

  it("uses the generic prefix for an unknown platform", () => {
    expect(formatChannelMessage({ text: "yo", from: "bob" }, "weirdnet")).toBe(
      "📨 weirdnet @bob: yo",
    );
  });

  it("omits the @sender segment when the sender is absent", () => {
    expect(formatChannelMessage({ text: "anon msg" }, "telegram")).toBe(
      "📨 telegram anon msg",
    );
  });

  it("omits the @sender segment when the sender is blank/whitespace", () => {
    expect(formatChannelMessage({ text: "msg", from: "   " }, "telegram")).toBe(
      "📨 telegram msg",
    );
  });

  it("collapses a multi-line message body to a single line", () => {
    const out = formatChannelMessage({ text: "line1\nline2\nline3", from: "a" }, "telegram");
    expect(out).toBe("📨 telegram @a: line1 line2 line3");
    expect(out).not.toContain("\n");
  });

  it("strips terminal escape injection from the text", () => {
    const nasty = `${ESC}[31mRED${ESC}[0m and ${ESC}]0;title\x07more`;
    const out = formatChannelMessage({ text: nasty, from: "ev\nil" }, "discord");
    expect(out).toBe("🎮 discord @ev il: RED and more");
    expect(out).not.toContain(ESC);
  });

  it("truncates long text with an ellipsis at the default max", () => {
    const out = formatChannelMessage({ text: "x".repeat(400), from: "a" }, "telegram");
    expect(out.endsWith("…")).toBe(true);
    // text segment is capped at DEFAULT_TEXT_MAX chars (incl. the ellipsis).
    const textPart = out.split(": ")[1] ?? "";
    expect(textPart.length).toBe(DEFAULT_TEXT_MAX);
  });

  it("does not truncate or add an ellipsis when text fits the max", () => {
    const out = formatChannelMessage({ text: "short", from: "a" }, "telegram");
    expect(out).toBe("📨 telegram @a: short");
    expect(out.endsWith("…")).toBe(false);
  });

  it("honors a custom textMax", () => {
    const out = formatChannelMessage({ text: "abcdefghij", from: "a" }, "telegram", { textMax: 5 });
    expect(out).toBe("📨 telegram @a: abcd…");
  });

  it("handles an empty message body", () => {
    expect(formatChannelMessage({ text: "", from: "a" }, "telegram")).toBe("📨 telegram @a:");
  });

  it("DEFAULT_TEXT_MAX is the documented default", () => {
    expect(DEFAULT_TEXT_MAX).toBe(280);
  });
});
