import { describe, it, expect } from "vitest";
import {
  DEFAULT_TYPING_INTERVAL_MS,
  startTyping,
  stopTyping,
  pauseTypingForApproval,
  resumeTypingAfterApproval,
  nextTypingTick,
  typingHeartbeatEnabled,
  type TypingState,
} from "./typing-heartbeat.js";

describe("startTyping", () => {
  it("returns an active, un-paused state stamped at nowMs", () => {
    const s = startTyping(1000);
    expect(s).toEqual({ active: true, pausedForApproval: false, lastSentMs: 1000 });
  });
});

describe("stopTyping", () => {
  it("returns an inactive state with the pause cleared", () => {
    const s = stopTyping(startTyping(1000));
    expect(s.active).toBe(false);
    expect(s.pausedForApproval).toBe(false);
  });

  it("clears a pending pause on stop", () => {
    const paused = pauseTypingForApproval(startTyping(1000));
    expect(stopTyping(paused).pausedForApproval).toBe(false);
  });

  it("is idempotent (stopping an already-stopped state stays inactive)", () => {
    const once = stopTyping(startTyping(1000));
    expect(stopTyping(once).active).toBe(false);
  });

  it("does not mutate the input state (immutable)", () => {
    const active = startTyping(1000);
    stopTyping(active);
    expect(active.active).toBe(true);
  });
});

describe("nextTypingTick", () => {
  it("sends when active, not paused, and the interval has elapsed — updating lastSentMs", () => {
    const s = startTyping(0);
    const r = nextTypingTick(s, DEFAULT_TYPING_INTERVAL_MS);
    expect(r.shouldSend).toBe(true);
    expect(r.state.lastSentMs).toBe(DEFAULT_TYPING_INTERVAL_MS);
  });

  it("sends when nowMs is well past the interval", () => {
    const r = nextTypingTick(startTyping(0), 20_000);
    expect(r.shouldSend).toBe(true);
    expect(r.state.lastSentMs).toBe(20_000);
  });

  it("does NOT send before the interval elapses — state unchanged", () => {
    const s = startTyping(0);
    const r = nextTypingTick(s, DEFAULT_TYPING_INTERVAL_MS - 1);
    expect(r.shouldSend).toBe(false);
    expect(r.state).toBe(s);
  });

  it("does NOT send while paused for an approval (the key behavior — no typing while blocked)", () => {
    const paused = pauseTypingForApproval(startTyping(0));
    const r = nextTypingTick(paused, 100_000); // long past the interval
    expect(r.shouldSend).toBe(false);
    expect(r.state).toBe(paused);
  });

  it("does NOT send when not active", () => {
    const stopped = stopTyping(startTyping(0));
    const r = nextTypingTick(stopped, 100_000);
    expect(r.shouldSend).toBe(false);
    expect(r.state).toBe(stopped);
  });

  it("honors a custom intervalMs", () => {
    const s = startTyping(0);
    expect(nextTypingTick(s, 2000, 3000).shouldSend).toBe(false);
    expect(nextTypingTick(s, 3000, 3000).shouldSend).toBe(true);
  });

  it("paces sends one interval apart across repeated ticks", () => {
    let s = startTyping(0);
    const first = nextTypingTick(s, 5000);
    expect(first.shouldSend).toBe(true);
    s = first.state;
    // A tick 1ms later must not re-send — only one interval has elapsed since lastSentMs.
    const tooSoon = nextTypingTick(s, 5001);
    expect(tooSoon.shouldSend).toBe(false);
    // A full further interval later it sends again.
    const second = nextTypingTick(s, 10_000);
    expect(second.shouldSend).toBe(true);
    expect(second.state.lastSentMs).toBe(10_000);
  });

  it("does not mutate the input state when it sends (immutable)", () => {
    const s: TypingState = startTyping(0);
    nextTypingTick(s, DEFAULT_TYPING_INTERVAL_MS);
    expect(s.lastSentMs).toBe(0);
  });
});

describe("pause / resume around an approval", () => {
  it("pauseTypingForApproval flags the pause; a tick during pause sends nothing", () => {
    const paused = pauseTypingForApproval(startTyping(0));
    expect(paused.pausedForApproval).toBe(true);
    expect(nextTypingTick(paused, 50_000).shouldSend).toBe(false);
  });

  it("resumeTypingAfterApproval un-pauses; ticks resume on the next interval", () => {
    const paused = pauseTypingForApproval(startTyping(0));
    const resumed = resumeTypingAfterApproval(paused);
    expect(resumed.pausedForApproval).toBe(false);
    expect(nextTypingTick(resumed, DEFAULT_TYPING_INTERVAL_MS).shouldSend).toBe(true);
  });

  it("pause preserves active + lastSentMs so the same session continues after resume", () => {
    const active = startTyping(1234);
    const paused = pauseTypingForApproval(active);
    expect(paused.active).toBe(true);
    expect(paused.lastSentMs).toBe(1234);
  });

  it("pause/resume do not mutate the input state (immutable)", () => {
    const active = startTyping(0);
    pauseTypingForApproval(active);
    expect(active.pausedForApproval).toBe(false);
  });
});

describe("typingHeartbeatEnabled", () => {
  it("defaults ON when the env var is unset", () => {
    expect(typingHeartbeatEnabled({})).toBe(true);
  });

  it("is OFF when set to 0", () => {
    expect(typingHeartbeatEnabled({ VANTA_TYPING_INDICATOR: "0" })).toBe(false);
  });

  it("is OFF when set to false (case-insensitive, whitespace-tolerant)", () => {
    expect(typingHeartbeatEnabled({ VANTA_TYPING_INDICATOR: " FALSE " })).toBe(false);
  });

  it("stays ON for any other value", () => {
    expect(typingHeartbeatEnabled({ VANTA_TYPING_INDICATOR: "1" })).toBe(true);
    expect(typingHeartbeatEnabled({ VANTA_TYPING_INDICATOR: "yes" })).toBe(true);
  });
});
