import { describe, it, expect } from "vitest";
import { bareEnabled, formatBareEvent, bareLines, type BareEvent } from "./bare-output.js";

// Real control bytes built from escape codes so the source survives any editor /
// tool that would otherwise mangle a literal ESC byte.
const ESC = "\x1b"; // ESC
const BEL = "\x07"; // BEL
const NUL = "\x00"; // NUL

describe("bareEnabled", () => {
  it("returns true when --bare is in argv", () => {
    expect(bareEnabled(["run", "--bare", "do it"], {})).toBe(true);
  });

  it("returns true when VANTA_BARE=1", () => {
    expect(bareEnabled(["run", "do it"], { VANTA_BARE: "1" })).toBe(true);
  });

  it("returns true when VANTA_BARE=true", () => {
    expect(bareEnabled(["run", "do it"], { VANTA_BARE: "true" })).toBe(true);
  });

  it("returns false when neither flag nor env is set (default off)", () => {
    expect(bareEnabled(["run", "do it"], {})).toBe(false);
  });

  it("returns false for a non-truthy VANTA_BARE value", () => {
    expect(bareEnabled(["run", "do it"], { VANTA_BARE: "0" })).toBe(false);
    expect(bareEnabled(["run", "do it"], { VANTA_BARE: "no" })).toBe(false);
    expect(bareEnabled(["run", "do it"], { VANTA_BARE: "" })).toBe(false);
  });

  it("prefers the flag even with VANTA_BARE unset", () => {
    expect(bareEnabled(["--bare"], { VANTA_BARE: undefined })).toBe(true);
  });
});

describe("formatBareEvent — content events", () => {
  it("text → stripped, trimmed plain line + newline", () => {
    expect(formatBareEvent({ kind: "text", text: "  hello world  " })).toBe("hello world\n");
  });

  it("result → stripped, trimmed plain line + newline", () => {
    expect(formatBareEvent({ kind: "result", text: "the answer is 42" })).toBe("the answer is 42\n");
  });

  it("empty text → \"\" (dropped)", () => {
    expect(formatBareEvent({ kind: "text", text: "" })).toBe("");
  });

  it("whitespace-only text → \"\" (dropped)", () => {
    expect(formatBareEvent({ kind: "text", text: "   \t  " })).toBe("");
  });

  it("preserves interior newlines in multi-line content", () => {
    expect(formatBareEvent({ kind: "result", text: "line one\nline two" })).toBe("line one\nline two\n");
  });
});

describe("formatBareEvent — tool events (documented minimal form: [tool] name)", () => {
  it("tool → minimal \"[tool] name\" line", () => {
    expect(formatBareEvent({ kind: "tool", name: "read_file" })).toBe("[tool] read_file\n");
  });

  it("empty tool name → \"\" (dropped)", () => {
    expect(formatBareEvent({ kind: "tool", name: "  " })).toBe("");
  });
});

describe("formatBareEvent — decoration events are suppressed", () => {
  it("decoration → \"\" (banner/cost/spinner produce no output)", () => {
    expect(formatBareEvent({ kind: "decoration" })).toBe("");
  });
});

describe("formatBareEvent — security: strip ANSI + control chars", () => {
  it("strips ANSI color/SGR escapes from content", () => {
    expect(formatBareEvent({ kind: "text", text: `${ESC}[31mred${ESC}[0m` })).toBe("red\n");
  });

  it("strips an OSC escape sequence (terminal title injection)", () => {
    expect(formatBareEvent({ kind: "result", text: `${ESC}]0;pwned${BEL}safe` })).toBe("safe\n");
  });

  it("strips bare control chars (BEL, NUL, ESC) so nothing reaches a pipe", () => {
    expect(formatBareEvent({ kind: "text", text: `ab${BEL}${NUL}cd${ESC}` })).toBe("abcd\n");
  });

  it("strips ANSI from a tool name too", () => {
    expect(formatBareEvent({ kind: "tool", name: `${ESC}[32mshell_cmd${ESC}[0m` })).toBe("[tool] shell_cmd\n");
  });
});

describe("bareLines", () => {
  it("joins non-empty bare lines, dropping suppressed decorations", () => {
    const events: BareEvent[] = [
      { kind: "decoration" },
      { kind: "tool", name: "read_file" },
      { kind: "text", text: "thinking" },
      { kind: "decoration" },
      { kind: "result", text: "done" },
    ];
    expect(bareLines(events)).toBe("[tool] read_file\nthinking\ndone\n");
  });

  it("empty event list → \"\"", () => {
    expect(bareLines([])).toBe("");
  });

  it("all-decoration list → \"\"", () => {
    expect(bareLines([{ kind: "decoration" }, { kind: "decoration" }])).toBe("");
  });

  it("drops empty/whitespace content events when joining", () => {
    const events: BareEvent[] = [
      { kind: "text", text: "  " },
      { kind: "result", text: "kept" },
      { kind: "text", text: "" },
    ];
    expect(bareLines(events)).toBe("kept\n");
  });

  it("strips control chars across the whole stream (no escape leaks to a downstream pipe)", () => {
    const events: BareEvent[] = [
      { kind: "text", text: `${ESC}[1mbold${ESC}[0m` },
      { kind: "result", text: "plain" },
    ];
    expect(bareLines(events)).toBe("bold\nplain\n");
    expect(bareLines(events)).not.toContain(ESC);
  });
});
