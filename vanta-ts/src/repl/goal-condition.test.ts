import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseDoneCondition, checkCondition, buildGoalLoopMax, checkGoalLoop, DEFAULT_GOAL_LOOP_MAX } from "./goal-condition.js";
import type { SafetyClient } from "../safety-client.js";

// --- parseDoneCondition ---

describe("parseDoneCondition", () => {
  it("extracts backtick-delimited command", () => {
    expect(parseDoneCondition("done when `npm test`")).toBe("npm test");
  });

  it("is case-insensitive on 'done when'", () => {
    expect(parseDoneCondition("DONE WHEN `cargo test`")).toBe("cargo test");
  });

  it("trims whitespace from the command", () => {
    expect(parseDoneCondition("done when `  exit 0  `")).toBe("exit 0");
  });

  it("returns null when no backtick condition is present", () => {
    expect(parseDoneCondition("build something great")).toBeNull();
    expect(parseDoneCondition("done when tests pass")).toBeNull(); // no backticks
  });
});

// --- buildGoalLoopMax ---

describe("buildGoalLoopMax", () => {
  it("returns DEFAULT_GOAL_LOOP_MAX when env is unset", () => {
    expect(buildGoalLoopMax({})).toBe(DEFAULT_GOAL_LOOP_MAX);
  });

  it("returns parsed value from VANTA_GOAL_LOOP_MAX", () => {
    expect(buildGoalLoopMax({ VANTA_GOAL_LOOP_MAX: "5" })).toBe(5);
  });

  it("falls back to default for invalid values", () => {
    expect(buildGoalLoopMax({ VANTA_GOAL_LOOP_MAX: "abc" })).toBe(DEFAULT_GOAL_LOOP_MAX);
    expect(buildGoalLoopMax({ VANTA_GOAL_LOOP_MAX: "0" })).toBe(DEFAULT_GOAL_LOOP_MAX);
    expect(buildGoalLoopMax({ VANTA_GOAL_LOOP_MAX: "-1" })).toBe(DEFAULT_GOAL_LOOP_MAX);
  });
});

// --- checkCondition ---

describe("checkCondition", () => {
  it("returns true when the command exits 0", async () => {
    expect(await checkCondition("true", process.cwd())).toBe(true);
  });

  it("returns false when the command exits non-zero", async () => {
    expect(await checkCondition("false", process.cwd())).toBe(false);
  });
});

// --- checkGoalLoop ---

describe("checkGoalLoop", () => {
  function makeSafety(overrides: Partial<SafetyClient> = {}): SafetyClient {
    return {
      getGoals: vi.fn().mockResolvedValue([]),
      completeGoal: vi.fn().mockResolvedValue(true),
      assess: vi.fn(),
      addGoal: vi.fn(),
      proposeApproval: vi.fn(),
      approve: vi.fn(),
      deny: vi.fn(),
      logEvent: vi.fn(),
      status: vi.fn(),
      ...overrides,
    } as unknown as SafetyClient;
  }

  let onNote: ReturnType<typeof vi.fn>;
  beforeEach(() => { onNote = vi.fn(); });

  it("returns null when no active goal exists", async () => {
    const safety = makeSafety({ getGoals: vi.fn().mockResolvedValue([]) });
    expect(await checkGoalLoop({ safety, cwd: process.cwd(), onNote })).toBeNull();
    expect(onNote).not.toHaveBeenCalled();
  });

  it("returns null when active goal has no done-condition", async () => {
    const safety = makeSafety({ getGoals: vi.fn().mockResolvedValue([{ id: 1, text: "build a feature", status: "active" }]) });
    expect(await checkGoalLoop({ safety, cwd: process.cwd(), onNote })).toBeNull();
  });

  it("returns null and completes goal when condition passes", async () => {
    const completeGoal = vi.fn().mockResolvedValue(true);
    const safety = makeSafety({
      getGoals: vi.fn().mockResolvedValue([{ id: 3, text: "done when `true`", status: "active" }]),
      completeGoal,
    });
    const result = await checkGoalLoop({ safety, cwd: process.cwd(), onNote });
    expect(result).toBeNull();
    expect(completeGoal).toHaveBeenCalledWith(3);
    expect(onNote).toHaveBeenCalledWith(expect.stringContaining("goal condition passed"));
  });

  it("returns continuation prompt when condition fails", async () => {
    const safety = makeSafety({
      getGoals: vi.fn().mockResolvedValue([{ id: 2, text: "done when `false`", status: "active" }]),
    });
    const result = await checkGoalLoop({ safety, cwd: process.cwd(), onNote });
    expect(result).toMatch(/Continue working toward/);
    expect(result).toMatch(/done when/);
    expect(onNote).not.toHaveBeenCalled();
  });

  it("returns null on getGoals failure (best-effort)", async () => {
    const safety = makeSafety({ getGoals: vi.fn().mockRejectedValue(new Error("kernel down")) });
    expect(await checkGoalLoop({ safety, cwd: process.cwd(), onNote })).toBeNull();
  });
});
