import { describe, it, expect } from "vitest";
import {
  detectTerminal,
  terminalLabel,
  copyOnSelectInstructions,
  copyOnSelectHelp,
  type TerminalKind,
} from "./copy-on-select.js";

const env = (o: Record<string, string | undefined>): NodeJS.ProcessEnv => o as NodeJS.ProcessEnv;

describe("detectTerminal", () => {
  it("detects iTerm2 from TERM_PROGRAM", () => {
    expect(detectTerminal(env({ TERM_PROGRAM: "iTerm.app" }))).toBe("iterm2");
  });

  it("detects Apple Terminal from TERM_PROGRAM", () => {
    expect(detectTerminal(env({ TERM_PROGRAM: "Apple_Terminal" }))).toBe("apple-terminal");
  });

  it("detects WezTerm from TERM_PROGRAM or WEZTERM_PANE", () => {
    expect(detectTerminal(env({ TERM_PROGRAM: "WezTerm" }))).toBe("wezterm");
    expect(detectTerminal(env({ WEZTERM_PANE: "0" }))).toBe("wezterm");
  });

  it("detects Windows Terminal from WT_SESSION", () => {
    expect(detectTerminal(env({ WT_SESSION: "abc-123" }))).toBe("windows-terminal");
  });

  it("detects Kitty from KITTY_WINDOW_ID or TERM", () => {
    expect(detectTerminal(env({ KITTY_WINDOW_ID: "1" }))).toBe("kitty");
    expect(detectTerminal(env({ TERM: "xterm-kitty" }))).toBe("kitty");
  });

  it("detects GNOME Terminal from a modern VTE_VERSION", () => {
    expect(detectTerminal(env({ VTE_VERSION: "6003" }))).toBe("gnome");
  });

  it("returns unknown for an old VTE_VERSION (conservative)", () => {
    expect(detectTerminal(env({ VTE_VERSION: "4000" }))).toBe("unknown");
  });

  it("returns unknown when no signature is present", () => {
    expect(detectTerminal(env({}))).toBe("unknown");
    expect(detectTerminal(env({ TERM_PROGRAM: "Hyper" }))).toBe("unknown");
  });
});

describe("copyOnSelectInstructions", () => {
  it("iterm2 names the real 'Copy to pasteboard on selection' setting", () => {
    const out = copyOnSelectInstructions("iterm2");
    expect(out).toContain("Copy to pasteboard on selection");
    expect(out).toContain("Selection");
  });

  it("apple-terminal honestly states there is no built-in setting", () => {
    const out = copyOnSelectInstructions("apple-terminal");
    expect(out).toContain("no built-in copy-on-select setting");
  });

  it("wezterm honestly states it is on by default", () => {
    const out = copyOnSelectInstructions("wezterm");
    expect(out).toContain("ON by default");
  });

  it("kitty gives the real copy_on_select kitty.conf line", () => {
    const out = copyOnSelectInstructions("kitty");
    expect(out).toContain("copy_on_select yes");
    expect(out).toContain("kitty.conf");
  });

  it("gnome honestly states it is automatic via the primary selection", () => {
    const out = copyOnSelectInstructions("gnome");
    expect(out).toContain("automatic");
    expect(out.toLowerCase()).toContain("primary selection");
  });

  it("windows-terminal gives the real copyOnSelect settings.json key", () => {
    const out = copyOnSelectInstructions("windows-terminal");
    expect(out).toContain('"copyOnSelect": true');
    expect(out).toContain("settings.json");
  });

  it("unknown falls back to a generic check-your-settings note", () => {
    const out = copyOnSelectInstructions("unknown");
    expect(out).toContain("Generic terminal");
    expect(out).toContain("copy on select");
  });

  it("returns a non-empty distinct block for every kind", () => {
    const kinds: TerminalKind[] = [
      "iterm2",
      "apple-terminal",
      "wezterm",
      "kitty",
      "gnome",
      "windows-terminal",
      "unknown",
    ];
    const blocks = kinds.map(copyOnSelectInstructions);
    for (const b of blocks) expect(b.length).toBeGreaterThan(0);
    expect(new Set(blocks).size).toBe(kinds.length);
  });
});

describe("terminalLabel", () => {
  it("labels each known kind and a friendly fallback for unknown", () => {
    expect(terminalLabel("iterm2")).toBe("iTerm2");
    expect(terminalLabel("windows-terminal")).toBe("Windows Terminal");
    expect(terminalLabel("unknown")).toBe("your terminal");
  });
});

describe("copyOnSelectHelp", () => {
  it("detects the terminal and formats a header plus its instructions", () => {
    const out = copyOnSelectHelp(env({ TERM_PROGRAM: "iTerm.app" }));
    expect(out).toContain("Detected: iTerm2");
    expect(out).toContain("enable copy-on-select");
    expect(out).toContain("Copy to pasteboard on selection");
  });

  it("uses the generic note + 'your terminal' header for an unknown env", () => {
    const out = copyOnSelectHelp(env({}));
    expect(out).toContain("Detected: your terminal");
    expect(out).toContain("Generic terminal");
  });
});
