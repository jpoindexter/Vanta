import { describe, it, expect } from "vitest";
import { parseTaskCap, cngRollouts } from "./eval-compress-cmd.js";

describe("parseTaskCap", () => {
  it("defaults to 2 when --tasks is absent", () => {
    expect(parseTaskCap(["compress"])).toBe(2);
  });
  it("reads --tasks N", () => {
    expect(parseTaskCap(["compress", "--tasks", "3"])).toBe(3);
  });
  it("ignores a non-positive / non-numeric --tasks", () => {
    expect(parseTaskCap(["compress", "--tasks", "0"])).toBe(2);
    expect(parseTaskCap(["compress", "--tasks", "x"])).toBe(2);
  });
});

describe("cngRollouts", () => {
  it("defaults to 1 (fast directional probe)", () => {
    expect(cngRollouts({})).toBe(1);
  });
  it("honors VANTA_EVAL_ROLLOUTS", () => {
    expect(cngRollouts({ VANTA_EVAL_ROLLOUTS: "2" })).toBe(2);
  });
  it("floors at 1", () => {
    expect(cngRollouts({ VANTA_EVAL_ROLLOUTS: "0" })).toBe(1);
  });
});
