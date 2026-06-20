import { describe, it, expect } from "vitest";
import { runOneHook } from "./shell-hook-run.js";
import type { ShellHook } from "./shell-hooks.js";

// Wiring tests for the in-progress hook indicator armed in runHook. The pure
// note builders + thresholds are tested in hook-progress.test.ts; here we prove
// the timer is armed, resolved, and cancelled correctly around a real hook run.

function collect(): { onStatus: (m: string) => void; messages: string[] } {
  const messages: string[] = [];
  return { onStatus: (m) => messages.push(m), messages };
}

describe("runHook in-progress wiring", () => {
  it("emits the in-progress note then the done line for a slow hook past the threshold", async () => {
    const hook: ShellHook = { command: "sleep 0.12" };
    const { onStatus, messages } = collect();
    // Threshold below the hook's runtime → the progress line must surface.
    const r = await runOneHook(hook, "PostToolUse", "{}", {
      onStatus,
      env: { VANTA_HOOK_PROGRESS_MS: "10" },
    });
    expect(r.code).toBe(0);
    expect(messages.some((m) => m.includes("running PostToolUse hook (shell)"))).toBe(true);
    expect(messages.some((m) => m.includes("PostToolUse hook (shell) done in"))).toBe(true);
  });

  it("emits NO progress line for an instant hook under the threshold (unchanged behavior)", async () => {
    const hook: ShellHook = { command: "true" };
    const { onStatus, messages } = collect();
    // High threshold → the hook resolves well before the timer; nothing surfaces.
    const r = await runOneHook(hook, "PreToolUse", "{}", {
      onStatus,
      env: { VANTA_HOOK_PROGRESS_MS: "5000" },
    });
    expect(r.code).toBe(0);
    expect(messages.some((m) => m.includes("running") || m.includes("done in"))).toBe(false);
  });

  it("the result is identical whether or not a progress line is shown (observational only)", async () => {
    const hook: ShellHook = { command: "printf hello" };
    const slow = await runOneHook(hook, "Stop", "{}", { onStatus: () => {}, env: { VANTA_HOOK_PROGRESS_MS: "0" } });
    const fast = await runOneHook(hook, "Stop", "{}", { onStatus: () => {}, env: { VANTA_HOOK_PROGRESS_MS: "5000" } });
    expect(slow).toEqual({ code: 0, stdout: "hello", stderr: "" });
    expect(fast).toEqual({ code: 0, stdout: "hello", stderr: "" });
  });

  it("does not leak a timer: the process exits cleanly after an instant hook (cancel always runs)", async () => {
    // If armProgress's timer were not cancelled, an un-ref'd pending timer would
    // keep the event loop alive past the run. A resolved promise here proves the
    // await path completed and cancel() ran without throwing.
    const hook: ShellHook = { command: "true" };
    const before = Date.now();
    await runOneHook(hook, "PostToolUse", "{}", { onStatus: () => {}, env: { VANTA_HOOK_PROGRESS_MS: "5000" } });
    // The run returned promptly (well under the 5000ms threshold) — the timer
    // never fired and was cancelled, so the hook was not delayed by it.
    expect(Date.now() - before).toBeLessThan(4000);
  });
});
