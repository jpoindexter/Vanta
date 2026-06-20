import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_NOTIFY_AFTER_MS,
  resolveNotifyAfterMs,
  isLongRunNotifyDisabled,
  shouldNotifyLongRun,
  buildLongRunNotice,
  maybeNotifyLongRun,
  type NotifyFn,
} from "./long-run-notify.js";

const env = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv =>
  over as NodeJS.ProcessEnv;

describe("shouldNotifyLongRun", () => {
  it("notifies when the run is long, the terminal is inactive, and it is enabled", () => {
    expect(shouldNotifyLongRun({ elapsedMs: 31_000, terminalActive: false, env: env() })).toBe(true);
  });

  it("does NOT notify for a fast run (below threshold)", () => {
    expect(shouldNotifyLongRun({ elapsedMs: 500, terminalActive: false, env: env() })).toBe(false);
  });

  it("does NOT notify when the terminal is active, even past the threshold", () => {
    expect(shouldNotifyLongRun({ elapsedMs: 120_000, terminalActive: true, env: env() })).toBe(false);
  });

  it("does NOT notify when disabled via VANTA_OS_NOTIFY=0", () => {
    expect(
      shouldNotifyLongRun({ elapsedMs: 120_000, terminalActive: false, env: env({ VANTA_OS_NOTIFY: "0" }) }),
    ).toBe(false);
  });

  it("does NOT notify when disabled via VANTA_OS_NOTIFY=false", () => {
    expect(
      shouldNotifyLongRun({ elapsedMs: 120_000, terminalActive: false, env: env({ VANTA_OS_NOTIFY: "false" }) }),
    ).toBe(false);
  });

  it("honors a threshold override via VANTA_NOTIFY_AFTER_MS", () => {
    const e = env({ VANTA_NOTIFY_AFTER_MS: "1000" });
    expect(shouldNotifyLongRun({ elapsedMs: 1_500, terminalActive: false, env: e })).toBe(true);
    expect(shouldNotifyLongRun({ elapsedMs: 900, terminalActive: false, env: e })).toBe(false);
  });

  it("treats exactly the threshold as long enough", () => {
    expect(
      shouldNotifyLongRun({ elapsedMs: DEFAULT_NOTIFY_AFTER_MS, terminalActive: false, env: env() }),
    ).toBe(true);
  });

  it("returns false on invalid input instead of throwing", () => {
    // @ts-expect-error — exercising the runtime boundary guard
    expect(shouldNotifyLongRun({ elapsedMs: "soon", terminalActive: false, env: env() })).toBe(false);
  });
});

describe("resolveNotifyAfterMs", () => {
  it("defaults to 30s when unset", () => {
    expect(resolveNotifyAfterMs(env())).toBe(DEFAULT_NOTIFY_AFTER_MS);
  });
  it("reads a valid override", () => {
    expect(resolveNotifyAfterMs(env({ VANTA_NOTIFY_AFTER_MS: "5000" }))).toBe(5000);
  });
  it("falls back to default on a negative or non-numeric value", () => {
    expect(resolveNotifyAfterMs(env({ VANTA_NOTIFY_AFTER_MS: "-1" }))).toBe(DEFAULT_NOTIFY_AFTER_MS);
    expect(resolveNotifyAfterMs(env({ VANTA_NOTIFY_AFTER_MS: "abc" }))).toBe(DEFAULT_NOTIFY_AFTER_MS);
  });
});

describe("isLongRunNotifyDisabled", () => {
  it("is disabled only for explicit 0 / false", () => {
    expect(isLongRunNotifyDisabled(env({ VANTA_OS_NOTIFY: "0" }))).toBe(true);
    expect(isLongRunNotifyDisabled(env({ VANTA_OS_NOTIFY: "false" }))).toBe(true);
    expect(isLongRunNotifyDisabled(env({ VANTA_OS_NOTIFY: "1" }))).toBe(false);
    expect(isLongRunNotifyDisabled(env())).toBe(false);
  });
});

describe("buildLongRunNotice", () => {
  it("builds the title + body with the task label", () => {
    expect(buildLongRunNotice("build the kernel")).toEqual({
      title: "Vanta finished",
      body: "Vanta finished — build the kernel",
    });
  });
  it("omits the dash when the label is empty/whitespace", () => {
    expect(buildLongRunNotice("   ")).toEqual({ title: "Vanta finished", body: "Vanta finished" });
  });
});

describe("maybeNotifyLongRun", () => {
  it("fires the injected notifier when shouldNotify is true", () => {
    const notify = vi.fn() as unknown as NotifyFn;
    const fired = maybeNotifyLongRun(
      { elapsedMs: 60_000, terminalActive: false, env: env() },
      { notify, taskLabel: "run the suite" },
    );
    expect(fired).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Vanta finished", message: "Vanta finished — run the suite", notificationType: "long_run" }),
    );
  });

  it("does NOT fire for a fast run", () => {
    const notify = vi.fn() as unknown as NotifyFn;
    const fired = maybeNotifyLongRun(
      { elapsedMs: 100, terminalActive: false, env: env() },
      { notify, taskLabel: "blink" },
    );
    expect(fired).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does NOT fire when the terminal is active", () => {
    const notify = vi.fn() as unknown as NotifyFn;
    maybeNotifyLongRun({ elapsedMs: 60_000, terminalActive: true, env: env() }, { notify, taskLabel: "x" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("does NOT fire when disabled", () => {
    const notify = vi.fn() as unknown as NotifyFn;
    maybeNotifyLongRun(
      { elapsedMs: 60_000, terminalActive: false, env: env({ VANTA_OS_NOTIFY: "0" }) },
      { notify, taskLabel: "x" },
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("swallows a notifier failure (best-effort, never throws)", () => {
    const notify = vi.fn(() => {
      throw new Error("osascript missing");
    }) as unknown as NotifyFn;
    const fired = maybeNotifyLongRun(
      { elapsedMs: 60_000, terminalActive: false, env: env() },
      { notify, taskLabel: "x" },
    );
    expect(fired).toBe(false);
  });
});
