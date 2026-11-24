import { afterEach, describe, expect, it, vi } from "vitest";
import { watchParentExit } from "./parent-watch.js";

afterEach(() => vi.useRealTimers());

describe("watchParentExit", () => {
  it("fires once when the parent pid changes (reparented after the parent died)", () => {
    vi.useFakeTimers();
    let parent = 900;
    const onOrphaned = vi.fn();
    watchParentExit(onOrphaned, { intervalMs: 100, deps: { getParentPid: () => parent, isAlive: () => true } });

    vi.advanceTimersByTime(300);
    expect(onOrphaned).not.toHaveBeenCalled();
    parent = 1;
    vi.advanceTimersByTime(300);

    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it("fires when the parent pid disappears even if the ppid value is unchanged", () => {
    vi.useFakeTimers();
    let alive = true;
    const onOrphaned = vi.fn();
    watchParentExit(onOrphaned, { intervalMs: 100, deps: { getParentPid: () => 900, isAlive: () => alive } });

    alive = false;
    vi.advanceTimersByTime(150);

    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it("watches nothing when the process was started by init", () => {
    vi.useFakeTimers();
    const onOrphaned = vi.fn();
    watchParentExit(onOrphaned, { intervalMs: 100, deps: { getParentPid: () => 1, isAlive: () => false } });

    vi.advanceTimersByTime(1000);

    expect(onOrphaned).not.toHaveBeenCalled();
  });

  it("stops polling when asked", () => {
    vi.useFakeTimers();
    let parent = 900;
    const onOrphaned = vi.fn();
    const stop = watchParentExit(onOrphaned, { intervalMs: 100, deps: { getParentPid: () => parent, isAlive: () => true } });

    stop();
    parent = 1;
    vi.advanceTimersByTime(500);

    expect(onOrphaned).not.toHaveBeenCalled();
  });
});
