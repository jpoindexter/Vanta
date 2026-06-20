import { describe, it, expect } from "vitest";
import {
  formatAdvisorMessage,
  advisorAttribution,
  advisorEnabled,
  ADVISOR_GLYPH,
  ADVISOR_TEXT_MAX,
} from "./advisor-msg.js";

// A control/ANSI escape: ESC [ 31 m (set red) — used to prove escape stripping.
const ANSI_RED = "\x1b[31m";
const ANSI_RESET = "\x1b[0m";
// Matches any C0/DEL/CSI control byte — built from escapes so the source has
// no literal control bytes.
const CONTROL_RE = new RegExp("[\\u0000-\\u001f\\u007f\\u009b]");

describe("formatAdvisorMessage", () => {
  it("renders glyph + attribution + text", () => {
    const out = formatAdvisorMessage("claude-opus", "Looks correct, but check the null path.");
    expect(out).toBe(`${ADVISOR_GLYPH} advisor (claude-opus): Looks correct, but check the null path.`);
  });

  it("leads with the scale glyph", () => {
    const out = formatAdvisorMessage("gpt-4o", "ok");
    expect(out.startsWith(`${ADVISOR_GLYPH} `)).toBe(true);
    expect(out).toContain("advisor (gpt-4o):");
  });

  it("truncates long text with an ellipsis", () => {
    const long = "x".repeat(ADVISOR_TEXT_MAX + 200);
    const out = formatAdvisorMessage("m", long);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("advisor (m):");
    // The rendered text body never exceeds the cap.
    const body = out.slice(out.indexOf(": ") + 2);
    expect(body.length).toBeLessThanOrEqual(ADVISOR_TEXT_MAX);
  });

  it("respects an explicit maxLen override", () => {
    const out = formatAdvisorMessage("m", "abcdefghij", { maxLen: 5 });
    const body = out.slice(out.indexOf(": ") + 2);
    expect(body).toBe("abcd…");
    expect(body.length).toBe(5);
  });

  it("does not truncate text at or under the limit", () => {
    const out = formatAdvisorMessage("m", "short review", { maxLen: 100 });
    expect(out).toBe(`${ADVISOR_GLYPH} advisor (m): short review`);
    expect(out).not.toContain("…");
  });

  it("strips control/ANSI escapes from the text (no escape injection)", () => {
    const out = formatAdvisorMessage("m", `${ANSI_RED}danger${ANSI_RESET}`);
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toContain("danger");
  });

  it("strips control/ANSI escapes from the model label (no escape injection)", () => {
    const out = formatAdvisorMessage(`${ANSI_RED}evil${ANSI_RESET}`, "ok");
    expect(out).not.toMatch(CONTROL_RE);
    // The visible label text survives, the escape does not.
    expect(out).toContain("advisor (evil):");
  });

  it("strips a forged newline so the advisor line stays one row", () => {
    const out = formatAdvisorMessage("m", "line one\nFAKE SYSTEM PROMPT");
    expect(out).not.toContain("\n");
    expect(out).toContain("line one FAKE SYSTEM PROMPT");
  });

  it("strips bare control chars (BEL, NUL, DEL) to spaces", () => {
    const out = formatAdvisorMessage("m", "a\x07b\x00c\x7fd");
    expect(out).not.toMatch(CONTROL_RE);
    // Each bare control char becomes a (collapsed) space → "a b c d".
    expect(out.endsWith("a b c d")).toBe(true);
  });

  it("removes a full 8-bit CSI sequence (introducer + final byte)", () => {
    // \x9b is the 8-bit CSI introducer; \x9bm is a complete sequence → removed whole.
    const out = formatAdvisorMessage("m", "before\x9bmafter");
    expect(out).not.toMatch(CONTROL_RE);
    expect(out).toBe(`${ADVISOR_GLYPH} advisor (m): beforeafter`);
  });

  it("renders attribution alone when text is empty", () => {
    expect(formatAdvisorMessage("claude-opus", "")).toBe(`${ADVISOR_GLYPH} advisor (claude-opus):`);
  });

  it("renders attribution alone when text is whitespace/control only", () => {
    expect(formatAdvisorMessage("m", `  ${ANSI_RESET}\t `)).toBe(`${ADVISOR_GLYPH} advisor (m):`);
  });
});

describe("advisorAttribution", () => {
  it("wraps the model label in parens", () => {
    expect(advisorAttribution("claude-opus")).toBe("advisor (claude-opus)");
  });

  it("falls back to a bare 'advisor' for an empty/blank label", () => {
    expect(advisorAttribution("")).toBe("advisor");
    expect(advisorAttribution("   ")).toBe("advisor");
  });

  it("sanitizes control sequences in the label", () => {
    expect(advisorAttribution(`${ANSI_RED}opus${ANSI_RESET}`)).toBe("advisor (opus)");
    expect(advisorAttribution(`${ANSI_RED}opus${ANSI_RESET}`)).not.toMatch(CONTROL_RE);
  });
});

describe("advisorEnabled", () => {
  it("is false when VANTA_ADVISOR_MODEL is unset", () => {
    expect(advisorEnabled({})).toBe(false);
  });

  it("is false when VANTA_ADVISOR_MODEL is empty or whitespace", () => {
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: "" })).toBe(false);
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: "   " })).toBe(false);
  });

  it('is false when set to "off" (any case)', () => {
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: "off" })).toBe(false);
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: "OFF" })).toBe(false);
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: " Off " })).toBe(false);
  });

  it("is true when a real advisor model is configured", () => {
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: "claude-opus" })).toBe(true);
    expect(advisorEnabled({ VANTA_ADVISOR_MODEL: " gpt-4o " })).toBe(true);
  });
});
