import { describe, it, expect } from "vitest";
import { detectInteractivePrompt, checkStall, type StallState } from "./shell-stall.js";

describe("detectInteractivePrompt", () => {
  const prompts = [
    "Continue? (y/n)",
    "Replace file? [Y/n]",
    "Replace file? [y/N]",
    "Are these settings correct? yes/no",
    "Apply now? (yes/no)",
    "continue?",
    "overwrite?",
    "Are you sure",
    "Press any key to continue",
    "Press enter to confirm",
    "password:",
    "Enter passphrase:",
    "proceed (y/n)",
    "Replace existing config y/n?",
  ];

  for (const p of prompts) {
    it(`returns true for an interactive tail ending in "${p}"`, () => {
      expect(detectInteractivePrompt(`some earlier output\n${p}`)).toBe(true);
    });
  }

  it("is case-insensitive", () => {
    expect(detectInteractivePrompt("CONTINUE? (Y/N)")).toBe(true);
    expect(detectInteractivePrompt("PASSWORD:")).toBe(true);
  });

  it("matches the last non-empty line, ignoring trailing blank lines", () => {
    expect(detectInteractivePrompt("Overwrite? (y/n)\n\n   \n")).toBe(true);
  });

  const prose = [
    "Build completed successfully.",
    "Installing dependencies...",
    "Downloaded 42 packages in 3.1s.",
    "Done. No errors found.",
    "The server is now listening on port 3000.",
    "Compiling TypeScript files for the project now.",
    "All tests passed.",
    "",
    "   ",
  ];

  for (const line of prose) {
    it(`returns false for non-interactive output "${line}"`, () => {
      expect(detectInteractivePrompt(line)).toBe(false);
    });
  }

  it("does not match a prose question without a y/n choice", () => {
    expect(detectInteractivePrompt("Have you considered the edge cases?")).toBe(false);
  });
});

describe("checkStall", () => {
  const interactiveTail = "running migration...\nContinue? (y/n)";
  const idleMs = 45_000;
  const base: StallState = { lastLen: 10, lastChangeMs: 1_000, notified: false };

  it("resets the idle clock and notified flag when output grows, no notify", () => {
    const prev: StallState = { lastLen: 10, lastChangeMs: 1_000, notified: true };
    const r = checkStall(prev, 25, interactiveTail, 50_000, idleMs);
    expect(r.notify).toBe(false);
    expect(r.state).toEqual({ lastLen: 25, lastChangeMs: 50_000, notified: false });
  });

  it("fires once after idle + interactive tail", () => {
    const r = checkStall(base, 10, interactiveTail, base.lastChangeMs + idleMs, idleMs);
    expect(r.notify).toBe(true);
    expect(r.state.notified).toBe(true);
  });

  it("does not refire once notified", () => {
    const first = checkStall(base, 10, interactiveTail, base.lastChangeMs + idleMs, idleMs);
    expect(first.notify).toBe(true);
    const second = checkStall(first.state, 10, interactiveTail, base.lastChangeMs + idleMs * 2, idleMs);
    expect(second.notify).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it("stays silent when idle but the tail is not interactive", () => {
    const r = checkStall(base, 10, "still compiling, please wait...", base.lastChangeMs + idleMs, idleMs);
    expect(r.notify).toBe(false);
    expect(r.state.notified).toBe(false);
  });

  it("stays silent when interactive but not yet idle long enough", () => {
    const r = checkStall(base, 10, interactiveTail, base.lastChangeMs + idleMs - 1, idleMs);
    expect(r.notify).toBe(false);
  });

  it("fires exactly at the idle threshold (>=)", () => {
    const r = checkStall(base, 10, interactiveTail, base.lastChangeMs + idleMs, idleMs);
    expect(r.notify).toBe(true);
  });
});
