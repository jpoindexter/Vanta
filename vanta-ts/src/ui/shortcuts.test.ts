import { describe, it, expect, vi } from "vitest";
import { maybeRunShortcut } from "./shortcuts.js";
import type { SafetyClient } from "../safety-client.js";

/** Poll until `cond()` is true or the cap elapses — avoids a flaky fixed sleep. */
async function until(cond: () => boolean, capMs = 4000): Promise<void> {
  const start = Date.now();
  while (!cond() && Date.now() - start < capMs) await new Promise((r) => setTimeout(r, 20));
}

const allowSafety = { assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "" }) } as unknown as SafetyClient;

describe("maybeRunShortcut", () => {
  it("ignores plain text and slash lines", () => {
    const note = vi.fn();
    expect(maybeRunShortcut("hello", { safety: allowSafety, repoRoot: ".", note })).toBe(false);
    expect(maybeRunShortcut("/help", { safety: allowSafety, repoRoot: ".", note })).toBe(false);
    expect(note).not.toHaveBeenCalled();
  });

  it("runs a !shell prefix and notes its output", async () => {
    const note = vi.fn();
    expect(maybeRunShortcut("! echo hi", { safety: allowSafety, repoRoot: process.cwd(), note })).toBe(true);
    await until(() => note.mock.calls.length > 0);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note.mock.calls[0]![0]).toContain("hi");
  });
});
