import { describe, it, expect } from "vitest";
import {
  detectTerminal,
  terminalLabel,
  terminalSetupInstructions,
  terminalSetup,
  type Terminal,
} from "./terminal-setup-cmd.js";
import type { ReplCtx, SlashResult } from "./types.js";

function makeCtx(env: NodeJS.ProcessEnv): ReplCtx {
  return { env } as unknown as ReplCtx;
}

describe("detectTerminal", () => {
  it("maps each TERM_PROGRAM to its terminal", () => {
    expect(detectTerminal({ TERM_PROGRAM: "iTerm.app" })).toBe("iterm");
    expect(detectTerminal({ TERM_PROGRAM: "Apple_Terminal" })).toBe("apple-terminal");
    expect(detectTerminal({ TERM_PROGRAM: "vscode" })).toBe("vscode");
    expect(detectTerminal({ TERM_PROGRAM: "WezTerm" })).toBe("wezterm");
  });

  it("detects WezTerm from WEZTERM_PANE when TERM_PROGRAM is absent", () => {
    expect(detectTerminal({ WEZTERM_PANE: "0" })).toBe("wezterm");
  });

  it("is case-insensitive on TERM_PROGRAM", () => {
    expect(detectTerminal({ TERM_PROGRAM: "ITERM.APP" })).toBe("iterm");
    expect(detectTerminal({ TERM_PROGRAM: "VSCode" })).toBe("vscode");
  });

  it("falls back to unknown for an unrecognized or missing terminal", () => {
    expect(detectTerminal({ TERM_PROGRAM: "Hyper" })).toBe("unknown");
    expect(detectTerminal({})).toBe("unknown");
  });
});

describe("terminalSetupInstructions", () => {
  it("iTerm2 instructions name the Keys menu and Send Text with a literal \\n", () => {
    const text = terminalSetupInstructions("iterm");
    expect(text).toContain("iTerm2");
    expect(text).toContain("Keys");
    expect(text).toContain("Send Text");
    expect(text).toContain("\\n");
  });

  it("Apple Terminal instructions name the Keyboard settings tab", () => {
    const text = terminalSetupInstructions("apple-terminal");
    expect(text).toContain("Apple Terminal");
    expect(text).toContain("Keyboard");
    expect(text).toContain("Send Text");
  });

  it("VS Code instructions give a keybindings.json snippet with sendSequence", () => {
    const text = terminalSetupInstructions("vscode");
    expect(text).toContain("keybindings.json");
    expect(text).toContain("shift+enter");
    expect(text).toContain("workbench.action.terminal.sendSequence");
    expect(text).toContain("terminalFocus");
  });

  it("WezTerm instructions reference the lua config and SendString", () => {
    const text = terminalSetupInstructions("wezterm");
    expect(text).toContain("wezterm.lua");
    expect(text).toContain("SendString");
    expect(text).toContain("SHIFT");
  });

  it("unknown returns a generic note that still mentions a newline binding", () => {
    const text = terminalSetupInstructions("unknown");
    expect(text.toLowerCase()).toContain("generic");
    expect(text).toContain("Shift+Enter");
    expect(text.toLowerCase()).toContain("newline");
  });

  it("every terminal produces non-empty instructions", () => {
    const all: Terminal[] = ["iterm", "apple-terminal", "vscode", "wezterm", "unknown"];
    for (const t of all) expect(terminalSetupInstructions(t).length).toBeGreaterThan(0);
  });
});

describe("terminalLabel", () => {
  it("gives a human label per terminal", () => {
    expect(terminalLabel("iterm")).toBe("iTerm2");
    expect(terminalLabel("apple-terminal")).toBe("Apple Terminal");
    expect(terminalLabel("vscode")).toContain("VS Code");
    expect(terminalLabel("wezterm")).toBe("WezTerm");
    expect(terminalLabel("unknown")).toBe("your terminal");
  });
});

describe("terminalSetup handler", () => {
  it("returns the detected terminal's instructions as output", async () => {
    const result = await terminalSetup("", makeCtx({ TERM_PROGRAM: "iTerm.app" }));
    expect(result.output).toContain("Detected: iTerm2");
    expect(result.output).toContain("Send Text");
  });

  it("uses the generic note for an unknown terminal", async () => {
    const result = await terminalSetup("", makeCtx({ TERM_PROGRAM: "Hyper" }));
    expect(result.output).toContain("your terminal");
    expect(result.output!.toLowerCase()).toContain("generic");
  });

  it("is print-only — returns only output, no write/exit/resend signals", async () => {
    const result: SlashResult = await terminalSetup("", makeCtx({ TERM_PROGRAM: "vscode" }));
    expect(Object.keys(result)).toEqual(["output"]);
    expect(result.exit).toBeUndefined();
    expect(result.resend).toBeUndefined();
    expect(result.restart).toBeUndefined();
  });
});
