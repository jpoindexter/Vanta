import { describe, it, expect } from "vitest";
import {
  shouldShowProgress,
  buildHookProgressNote,
  buildHookProgressDone,
  resolveHookProgressMs,
  DEFAULT_HOOK_PROGRESS_MS,
} from "./hook-progress.js";

describe("shouldShowProgress", () => {
  it("returns true when elapsed-so-far exceeds the default threshold", () => {
    expect(shouldShowProgress(301, DEFAULT_HOOK_PROGRESS_MS)).toBe(true);
  });

  it("returns false when elapsed-so-far equals the threshold (silent at the boundary)", () => {
    expect(shouldShowProgress(300, DEFAULT_HOOK_PROGRESS_MS)).toBe(false);
  });

  it("returns false when an instant hook is well under the threshold (no spam)", () => {
    expect(shouldShowProgress(5, DEFAULT_HOOK_PROGRESS_MS)).toBe(false);
  });

  it("uses the default 300ms threshold when none is passed", () => {
    expect(DEFAULT_HOOK_PROGRESS_MS).toBe(300);
    expect(shouldShowProgress(400, 300)).toBe(true);
    expect(shouldShowProgress(200, 300)).toBe(false);
  });

  it("honors an explicit lower threshold", () => {
    expect(shouldShowProgress(150, 100)).toBe(true);
    expect(shouldShowProgress(80, 100)).toBe(false);
  });
});

describe("resolveHookProgressMs", () => {
  it("defaults to 300 with no env override", () => {
    expect(resolveHookProgressMs({})).toBe(300);
  });

  it("reads VANTA_HOOK_PROGRESS_MS when valid", () => {
    expect(resolveHookProgressMs({ VANTA_HOOK_PROGRESS_MS: "150" })).toBe(150);
  });

  it("treats 0 as 'surface every hook's progress'", () => {
    expect(resolveHookProgressMs({ VANTA_HOOK_PROGRESS_MS: "0" })).toBe(0);
    expect(shouldShowProgress(1, 0)).toBe(true);
  });

  it("falls back to the default on a non-numeric or negative value", () => {
    expect(resolveHookProgressMs({ VANTA_HOOK_PROGRESS_MS: "abc" })).toBe(300);
    expect(resolveHookProgressMs({ VANTA_HOOK_PROGRESS_MS: "-5" })).toBe(300);
  });
});

describe("buildHookProgressNote", () => {
  it("names the event and the hook type in the in-progress line", () => {
    const note = buildHookProgressNote("PreToolUse", "shell");
    expect(note).toContain("PreToolUse");
    expect(note).toContain("shell");
    expect(note).toContain("running");
  });

  it("marks the line as in-progress with a trailing ellipsis", () => {
    expect(buildHookProgressNote("Stop", "http")).toMatch(/…$/);
  });
});

describe("buildHookProgressDone", () => {
  it("names the event, type, and the elapsed ms on completion", () => {
    const done = buildHookProgressDone("PreToolUse", "shell", 742);
    expect(done).toContain("PreToolUse");
    expect(done).toContain("shell");
    expect(done).toContain("742ms");
    expect(done).toContain("done");
  });

  it("rounds fractional elapsed times", () => {
    expect(buildHookProgressDone("Stop", "agent", 742.6)).toContain("743ms");
  });

  it("is distinct from the in-progress note (resolved, not running)", () => {
    const note = buildHookProgressNote("PostToolUse", "mcp_tool");
    const done = buildHookProgressDone("PostToolUse", "mcp_tool", 120);
    expect(done).not.toEqual(note);
    expect(note).toContain("…");
    expect(done).not.toContain("…");
  });
});
