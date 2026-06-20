import { describe, it, expect } from "vitest";
import type { SessionCost } from "../pricing.js";
import { buildShutdownMessage, sessionDurationLabel } from "./shutdown-msg.js";

// A SessionCost with the given metered frontier spend; other fields are inert here.
function cost(frontierUsd: number): SessionCost {
  return { localUsd: 0, frontierUsd, localTurns: 0, frontierTurns: 1, totalTokensSaved: 0 };
}

// Two iso strings `ms` apart, anchored at a fixed start so the fn is exercised
// over real timestamps (never the wall clock).
function span(ms: number): { startedIso: string; nowIso: string } {
  const start = Date.parse("2026-06-20T10:00:00.000Z");
  return { startedIso: new Date(start).toISOString(), nowIso: new Date(start + ms).toISOString() };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("sessionDurationLabel", () => {
  it("formats a sub-minute span in seconds", () => {
    const { startedIso, nowIso } = span(45 * SECOND);
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("45s");
  });

  it("formats a sub-hour span in whole minutes", () => {
    const { startedIso, nowIso } = span(7 * MINUTE + 30 * SECOND);
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("7m");
  });

  it("formats a multi-hour span as `Xh Ym`", () => {
    const { startedIso, nowIso } = span(HOUR + 3 * MINUTE);
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("1h 3m");
  });

  it("drops a trailing zero-minute on a whole-hour span", () => {
    const { startedIso, nowIso } = span(2 * HOUR);
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("2h");
  });

  it("reads `0s` at the minute boundary floor (59s)", () => {
    const { startedIso, nowIso } = span(0);
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("0s");
  });

  it("clamps a reversed (negative) span to 0s rather than going negative", () => {
    const { startedIso, nowIso } = span(5 * MINUTE);
    // pass them swapped → now is before start
    expect(sessionDurationLabel(nowIso, startedIso)).toBe("0s");
  });

  it("falls back to 0s on an unparsable timestamp", () => {
    expect(sessionDurationLabel("not-a-date", "2026-06-20T10:05:00.000Z")).toBe("0s");
  });

  it("derives duration only from the two passed values (deterministic, no wall clock)", () => {
    const { startedIso, nowIso } = span(7 * MINUTE);
    // repeated calls with the same inputs are stable
    expect(sessionDurationLabel(startedIso, nowIso)).toBe(sessionDurationLabel(startedIso, nowIso));
    expect(sessionDurationLabel(startedIso, nowIso)).toBe("7m");
  });
});

describe("buildShutdownMessage", () => {
  it("builds the full summary for a multi-turn session with duration + turns + cost", () => {
    const { startedIso, nowIso } = span(7 * MINUTE);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 12, sessionCost: cost(0.03) });
    expect(line).toBe("✶ Session ended · 12 turns · 7m · $0.03 — see you next time");
  });

  it("emits the minimal line for a 0-turn session (no noisy summary)", () => {
    const { startedIso, nowIso } = span(2 * MINUTE);
    expect(buildShutdownMessage({ startedIso, nowIso, turnCount: 0 })).toBe("✶ Session ended");
  });

  it("treats a negative turn count as minimal too", () => {
    const { startedIso, nowIso } = span(2 * MINUTE);
    expect(buildShutdownMessage({ startedIso, nowIso, turnCount: -1 })).toBe("✶ Session ended");
  });

  it("singularizes a one-turn session", () => {
    const { startedIso, nowIso } = span(45 * SECOND);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 1 });
    expect(line).toBe("✶ Session ended · 1 turn · 45s — see you next time");
  });

  it("omits cost when no sessionCost is provided", () => {
    const { startedIso, nowIso } = span(7 * MINUTE);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 5 });
    expect(line).toBe("✶ Session ended · 5 turns · 7m — see you next time");
    expect(line).not.toContain("$");
  });

  it("omits cost when the frontier spend is zero (local-only session)", () => {
    const { startedIso, nowIso } = span(7 * MINUTE);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 5, sessionCost: cost(0) });
    expect(line).not.toContain("$");
  });

  it("includes sub-cent cost when present and non-zero", () => {
    const { startedIso, nowIso } = span(1 * MINUTE);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 3, sessionCost: cost(0.0042) });
    expect(line).toContain("$0.0042");
    expect(line).toBe("✶ Session ended · 3 turns · 1m — see you next time".replace(" —", " · $0.0042 —"));
  });

  it("renders a multi-hour duration inside the full line", () => {
    const { startedIso, nowIso } = span(HOUR + 3 * MINUTE);
    const line = buildShutdownMessage({ startedIso, nowIso, turnCount: 40, sessionCost: cost(1.5) });
    expect(line).toBe("✶ Session ended · 40 turns · 1h 3m · $1.50 — see you next time");
  });
});
