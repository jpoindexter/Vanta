import { describe, expect, it } from "vitest";
import { buildMissionState } from "./app-v2.js";
import type { RunSetup } from "../../session.js";

function setup(over: Partial<RunSetup> = {}): RunSetup {
  return {
    provider: {
      modelId: () => "claude-sonnet",
      contextWindow: () => 200_000,
    },
    registry: { schemas: () => [{ name: "shell" }, { name: "read_file" }] },
    pluginCommands: { list: () => [{ name: "deploy", desc: "deploy" }] },
    goals: [{ id: 1, text: "ship v2 rails", status: "active" }],
    systemPrompt: "system prompt text",
    ralphContinuity: "resume context",
    safety: {},
    effortLevel: "medium",
    ...over,
  } as unknown as RunSetup;
}

describe("buildMissionState", () => {
  it("projects real RunSetup state into the v2 rails", () => {
    const state = buildMissionState(
      setup(),
      "/repo/vanta",
      new Date("2026-07-09T17:00:00.000Z"),
      new Date("2026-07-09T17:00:09.000Z"),
    );
    expect(state.model).toBe("claude-sonnet");
    expect(state.contextWindow).toBe(200_000);
    expect(state.goal).toBe("ship v2 rails");
    expect(state.safetyVerdict).toBe("ALLOW");
    expect(state.safetyReason).toContain("kernel");
    expect(state.workingMemory).toContain("tools: 2");
    expect(state.workingMemory).toContain("commands: 1");
    expect(state.workingMemory).toContain("continuity: loaded");
    expect(state.telemetry.tokens).toBeGreaterThan(0);
    expect(state.telemetry.elapsed).toBe("9s");
  });

  it("asks before autonomy when no active goal is present", () => {
    const state = buildMissionState(
      setup({ goals: [{ id: 1, text: "old", status: "done" }] }),
      "/repo/vanta",
      new Date("2026-07-09T17:00:00.000Z"),
      new Date("2026-07-09T17:00:00.000Z"),
    );
    expect(state.goal).toBeNull();
    expect(state.safetyVerdict).toBe("ASK");
    expect(state.workingMemory[0]).toBe("goal: none");
  });

  it("blocks the rail when no tools are loaded", () => {
    const state = buildMissionState(
      setup({ registry: { schemas: () => [] } as unknown as RunSetup["registry"] }),
      "/repo/vanta",
      new Date("2026-07-09T17:00:00.000Z"),
      new Date("2026-07-09T17:00:00.000Z"),
    );
    expect(state.safetyVerdict).toBe("BLOCK");
    expect(state.safetyReason).toBe("no tools loaded");
  });
});
