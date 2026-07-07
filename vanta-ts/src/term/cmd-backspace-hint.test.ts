import { describe, it, expect, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTerminalApp, isKittyCapable, shouldShowCmdBackspaceHint, maybeShowCmdBackspaceHint } from "./cmd-backspace-hint.js";

// TUI-CMD-BACKSPACE-TERMINALAPP — one-time Terminal.app hint.

describe("isTerminalApp / isKittyCapable", () => {
  it("identifies Terminal.app", () => {
    expect(isTerminalApp({ TERM_PROGRAM: "Apple_Terminal" })).toBe(true);
    expect(isTerminalApp({ TERM_PROGRAM: "iTerm.app" })).toBe(false);
  });
  it("identifies kitty-protocol terminals", () => {
    expect(isKittyCapable({ KITTY_WINDOW_ID: "1" })).toBe(true);
    expect(isKittyCapable({ TERM_PROGRAM: "ghostty" })).toBe(true);
    expect(isKittyCapable({ TERM_PROGRAM: "WezTerm" })).toBe(true);
    expect(isKittyCapable({ TERM_PROGRAM: "Apple_Terminal" })).toBe(false);
  });
});

describe("shouldShowCmdBackspaceHint", () => {
  it("shows only on Terminal.app, not-capable, not-already-shown", () => {
    expect(shouldShowCmdBackspaceHint({ TERM_PROGRAM: "Apple_Terminal" }, false)).toBe(true);
  });
  it("does not show when already shown", () => {
    expect(shouldShowCmdBackspaceHint({ TERM_PROGRAM: "Apple_Terminal" }, true)).toBe(false);
  });
  it("does not show on a capable terminal (zero change elsewhere)", () => {
    expect(shouldShowCmdBackspaceHint({ TERM_PROGRAM: "ghostty" }, false)).toBe(false);
    expect(shouldShowCmdBackspaceHint({ KITTY_WINDOW_ID: "1" }, false)).toBe(false);
  });
});

describe("maybeShowCmdBackspaceHint (one-time)", () => {
  it("emits once on Terminal.app, then never again (persisted flag)", async () => {
    const env = { TERM_PROGRAM: "Apple_Terminal", VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-hint-")) };
    const emit = vi.fn();
    expect(await maybeShowCmdBackspaceHint(env, emit)).toBe(true);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![0]).toContain("^U");
    // Second call: the flag is persisted → no re-show.
    expect(await maybeShowCmdBackspaceHint(env, emit)).toBe(false);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("never emits on a capable terminal", async () => {
    const env = { TERM_PROGRAM: "ghostty", VANTA_HOME: await mkdtemp(join(tmpdir(), "vanta-hint-")) };
    const emit = vi.fn();
    expect(await maybeShowCmdBackspaceHint(env, emit)).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });
});
