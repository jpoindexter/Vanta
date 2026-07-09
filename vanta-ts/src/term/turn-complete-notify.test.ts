import { describe, it, expect, vi } from "vitest";
import { buildTurnCompleteNotice, isWindowFocused, maybeNotifyTurnComplete } from "./turn-complete-notify.js";

const env = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => over as NodeJS.ProcessEnv;

describe("buildTurnCompleteNotice", () => {
  it("builds a compact completion notification from the prompt", () => {
    expect(buildTurnCompleteNotice("  fix the tests\nand commit ")).toEqual({
      title: "Vanta finished",
      message: "Turn complete: fix the tests and commit",
    });
  });
});

describe("isWindowFocused", () => {
  it("honors the env focus override", async () => {
    expect(await isWindowFocused(env({ VANTA_WINDOW_FOCUSED: "0" }), { windowFocused: () => true })).toBe(false);
    expect(await isWindowFocused(env({ VANTA_WINDOW_FOCUSED: "1" }), { windowFocused: () => false })).toBe(true);
  });

  it("fails focused when the injected probe throws", async () => {
    expect(await isWindowFocused(env(), { windowFocused: () => { throw new Error("no signal"); } })).toBe(true);
  });
});

describe("maybeNotifyTurnComplete", () => {
  it("notifies when enabled, completed, and unfocused", async () => {
    const notify = vi.fn();
    const fired = await maybeNotifyTurnComplete(
      { prompt: "run the suite", finalText: "done", env: env({ VANTA_NOTIFY_UNFOCUSED: "1" }), dataDir: "/tmp/.vanta", cwd: "/tmp" },
      { notify, windowFocused: () => false },
    );
    expect(fired).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      title: "Vanta finished",
      message: "Turn complete: run the suite",
      notificationType: "turn_complete",
      env: expect.objectContaining({ VANTA_NOTIFY: "1" }),
    }));
  });

  it("stays silent when disabled, focused, or no final text exists", async () => {
    const notify = vi.fn();
    expect(await maybeNotifyTurnComplete({ prompt: "x", finalText: "done", env: env() }, { notify, windowFocused: () => false })).toBe(false);
    expect(await maybeNotifyTurnComplete({ prompt: "x", finalText: "done", env: env({ VANTA_NOTIFY_UNFOCUSED: "1" }) }, { notify, windowFocused: () => true })).toBe(false);
    expect(await maybeNotifyTurnComplete({ prompt: "x", finalText: " ", env: env({ VANTA_NOTIFY_UNFOCUSED: "1" }) }, { notify, windowFocused: () => false })).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
