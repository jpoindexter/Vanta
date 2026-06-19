import { describe, it, expect } from "vitest";
import { supportsHyperlinks, osc8 } from "./osc8.js";

const env = (o: Record<string, string | undefined>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("supportsHyperlinks", () => {
  it("honors VANTA_HYPERLINKS=1 even off a TTY", () => {
    expect(supportsHyperlinks(env({ VANTA_HYPERLINKS: "1" }), false)).toBe(true);
    expect(supportsHyperlinks(env({ VANTA_HYPERLINKS: "true" }), false)).toBe(true);
  });

  it("honors VANTA_HYPERLINKS=0 even on a known terminal TTY", () => {
    expect(supportsHyperlinks(env({ VANTA_HYPERLINKS: "0", TERM_PROGRAM: "iTerm.app" }), true)).toBe(false);
    expect(supportsHyperlinks(env({ VANTA_HYPERLINKS: "false", TERM_PROGRAM: "iTerm.app" }), true)).toBe(false);
  });

  it("never emits when not a TTY (piped/captured output)", () => {
    expect(supportsHyperlinks(env({ TERM_PROGRAM: "iTerm.app" }), false)).toBe(false);
  });

  it("detects known terminal programs on a TTY", () => {
    for (const p of ["iTerm.app", "WezTerm", "vscode", "ghostty"]) {
      expect(supportsHyperlinks(env({ TERM_PROGRAM: p }), true)).toBe(true);
    }
  });

  it("detects Windows Terminal, kitty, and modern VTE", () => {
    expect(supportsHyperlinks(env({ WT_SESSION: "abc" }), true)).toBe(true);
    expect(supportsHyperlinks(env({ KITTY_WINDOW_ID: "1" }), true)).toBe(true);
    expect(supportsHyperlinks(env({ VTE_VERSION: "6003" }), true)).toBe(true);
  });

  it("returns false for unknown terminals (conservative fallback)", () => {
    expect(supportsHyperlinks(env({ TERM_PROGRAM: "Apple_Terminal" }), true)).toBe(false);
    expect(supportsHyperlinks(env({ VTE_VERSION: "4000" }), true)).toBe(false);
    expect(supportsHyperlinks(env({}), true)).toBe(false);
  });
});

describe("osc8", () => {
  it("wraps the label in the OSC-8 escape when enabled", () => {
    const out = osc8("https://example.com", "example.com", true);
    expect(out).toBe("\x1b]8;;https://example.com\x1b\\example.com\x1b]8;;\x1b\\");
    expect(out).toContain("example.com");
  });

  it("returns the plain label when disabled", () => {
    expect(osc8("https://example.com", "example.com", false)).toBe("example.com");
  });

  it("returns the plain label when the url is empty", () => {
    expect(osc8("", "click", true)).toBe("click");
  });
});
