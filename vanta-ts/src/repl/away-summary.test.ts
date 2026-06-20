import { describe, it, expect } from "vitest";
import {
  isAway,
  awayDurationLabel,
  buildAwaySummary,
  resolveAwayThresholdMs,
  DEFAULT_AWAY_MS,
  type AwaySummaryInput,
} from "./away-summary.js";

describe("isAway", () => {
  it("is true when the gap is at least the default threshold (5+ min away)", () => {
    // Arrange
    const lastActiveMs = 0;
    const nowMs = DEFAULT_AWAY_MS; // exactly 5 min
    // Act / Assert
    expect(isAway(lastActiveMs, nowMs)).toBe(true);
  });

  it("is true for a long gap well past the threshold", () => {
    expect(isAway(0, 60 * 60_000)).toBe(true);
  });

  it("is false under the threshold (a short pause is not 'away')", () => {
    // Arrange — 4m59s gap, just under 5 min.
    const gap = DEFAULT_AWAY_MS - 1_000;
    // Act / Assert
    expect(isAway(0, gap)).toBe(false);
  });

  it("is false at zero elapsed", () => {
    expect(isAway(1000, 1000)).toBe(false);
  });

  it("respects a custom threshold", () => {
    // A 2-min gap trips a strict 1-min gate but not the default 5-min one.
    expect(isAway(0, 2 * 60_000, 60_000)).toBe(true);
    expect(isAway(0, 2 * 60_000)).toBe(false);
  });

  it("is disabled when the threshold is 0 (never away)", () => {
    expect(isAway(0, 10 * 60_000, 0)).toBe(false);
  });
});

describe("awayDurationLabel", () => {
  it("renders sub-minute gaps in seconds", () => {
    expect(awayDurationLabel(45_000)).toBe("45s");
    expect(awayDurationLabel(0)).toBe("0s");
  });

  it("renders minute gaps as compact minutes", () => {
    expect(awayDurationLabel(7 * 60_000)).toBe("7m");
    expect(awayDurationLabel(5 * 60_000)).toBe("5m");
  });

  it("renders hour+minute gaps as 'Xh Ym'", () => {
    expect(awayDurationLabel(63 * 60_000)).toBe("1h 3m");
  });

  it("drops the trailing minutes on a whole-hour gap", () => {
    expect(awayDurationLabel(2 * 60 * 60_000)).toBe("2h");
  });

  it("clamps negative input to 0s", () => {
    expect(awayDurationLabel(-1000)).toBe("0s");
  });
});

describe("resolveAwayThresholdMs", () => {
  it("falls back to the 5-minute default when unset", () => {
    expect(resolveAwayThresholdMs({})).toBe(DEFAULT_AWAY_MS);
  });

  it("falls back to the default for a non-numeric value", () => {
    expect(resolveAwayThresholdMs({ VANTA_AWAY_SUMMARY_MS: "abc" })).toBe(DEFAULT_AWAY_MS);
  });

  it("falls back to the default for a negative value", () => {
    expect(resolveAwayThresholdMs({ VANTA_AWAY_SUMMARY_MS: "-1" })).toBe(DEFAULT_AWAY_MS);
  });

  it("reads a valid override from the environment", () => {
    expect(resolveAwayThresholdMs({ VANTA_AWAY_SUMMARY_MS: "600000" })).toBe(600_000);
  });

  it("reads 0 as an explicit disable", () => {
    expect(resolveAwayThresholdMs({ VANTA_AWAY_SUMMARY_MS: "0" })).toBe(0);
  });
});

describe("buildAwaySummary", () => {
  it("returns the full recap with elapsed + counts + last action when away with activity", () => {
    // Arrange — 7 min away, real work happened.
    const input: AwaySummaryInput = {
      awayMs: 7 * 60_000,
      turnsWhileAway: 3,
      filesTouched: 4,
      lastAction: "write_file src/index.ts",
    };
    // Act
    const recap = buildAwaySummary(input);
    // Assert
    expect(recap).toBe("⏱ Back after 7m — 3 turns, 4 files touched, last: write_file src/index.ts");
  });

  it("returns null when below the threshold (not actually away)", () => {
    // Arrange — only 2 min away, even with activity.
    const input: AwaySummaryInput = {
      awayMs: 2 * 60_000,
      turnsWhileAway: 5,
      filesTouched: 2,
      lastAction: "ran tests",
    };
    // Act / Assert
    expect(buildAwaySummary(input)).toBeNull();
  });

  it("returns null when away but nothing happened (no turns, files, or action)", () => {
    // Arrange — long away gap, but the session was idle.
    const input: AwaySummaryInput = {
      awayMs: 30 * 60_000,
      turnsWhileAway: 0,
      filesTouched: 0,
      lastAction: "",
    };
    // Act / Assert
    expect(buildAwaySummary(input)).toBeNull();
  });

  it("returns a minimal line when away with only a last action (no turns/files)", () => {
    // Arrange — away, nothing completed, but there is a current-state breadcrumb.
    const input: AwaySummaryInput = {
      awayMs: 10 * 60_000,
      turnsWhileAway: 0,
      filesTouched: 0,
      lastAction: "waiting on approval",
    };
    // Act
    const recap = buildAwaySummary(input);
    // Assert — just elapsed + the last action, no counts.
    expect(recap).toBe("⏱ Back after 10m — last: waiting on approval");
  });

  it("singularizes a single turn and single file", () => {
    const recap = buildAwaySummary({
      awayMs: 6 * 60_000,
      turnsWhileAway: 1,
      filesTouched: 1,
      lastAction: "",
    });
    expect(recap).toBe("⏱ Back after 6m — 1 turn, 1 file touched");
  });

  it("omits the files clause when no files were touched", () => {
    const recap = buildAwaySummary({
      awayMs: 6 * 60_000,
      turnsWhileAway: 2,
      filesTouched: 0,
      lastAction: "",
    });
    expect(recap).toBe("⏱ Back after 6m — 2 turns");
  });

  it("formats an hour-plus away gap in the recap", () => {
    const recap = buildAwaySummary({
      awayMs: 63 * 60_000,
      turnsWhileAway: 8,
      filesTouched: 12,
      lastAction: "commit",
    });
    expect(recap).toBe("⏱ Back after 1h 3m — 8 turns, 12 files touched, last: commit");
  });

  it("returns null on invalid input rather than throwing (errors-as-values)", () => {
    // Arrange — a malformed input bypassing the compiler (LLM/host boundary).
    const bad = { awayMs: "soon", turnsWhileAway: -1 } as unknown as AwaySummaryInput;
    // Act / Assert
    expect(buildAwaySummary(bad)).toBeNull();
  });

  it("respects a custom threshold for the away check", () => {
    // A 2-min gap surfaces a recap under a 1-min gate but null under the default.
    const input: AwaySummaryInput = {
      awayMs: 2 * 60_000,
      turnsWhileAway: 1,
      filesTouched: 0,
      lastAction: "",
    };
    expect(buildAwaySummary(input, 60_000)).toBe("⏱ Back after 2m — 1 turn");
    expect(buildAwaySummary(input)).toBeNull();
  });

  it("trims whitespace-only last actions to nothing", () => {
    // A whitespace-only action is treated as no action; with no counts → null.
    const recap = buildAwaySummary({
      awayMs: 10 * 60_000,
      turnsWhileAway: 0,
      filesTouched: 0,
      lastAction: "   ",
    });
    expect(recap).toBeNull();
  });
});
