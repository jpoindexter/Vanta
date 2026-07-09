import { createElement as h } from "react";
import { Text } from "ink";
import { describe, expect, it } from "vitest";
import { renderUi, tick } from "../test-render.js";
import { MissionControlFrame } from "./mission-control.js";

describe("MissionControlFrame", () => {
  it("renders the three operator columns", async () => {
    const inst = renderUi(
      h(MissionControlFrame, {
        model: "gpt-5.5",
        visionModel: "gpt-4o-mini",
        repoRoot: "/repo/vanta",
        contextUsed: 38_000,
        contextWindow: 1_000_000,
        goal: "ship TUI-V2",
        safetyVerdict: "ASK",
        safetyReason: "approval required",
        workingMemory: ["goal: ship TUI-V2", "tools: 42"],
        telemetry: { tokens: 38_000, costUsd: 0.14, elapsed: "12m" },
        children: h(Text, null, "center transcript"),
      }),
    );
    await tick();

    const out = inst.lastFrame();
    expect(out).toContain("Durable State");
    expect(out).toContain("Mission Control");
    expect(out).toContain("Safety Rail");
    expect(out).toContain("Working Memory");
    expect(out).toContain("Telemetry");
    expect(out).toContain("center transcript");
    inst.unmount();
  });

  it("shows command risk labels in the right rail", async () => {
    const inst = renderUi(
      h(MissionControlFrame, {
        model: "claude-sonnet",
        repoRoot: "/repo/vanta",
        contextUsed: 0,
        contextWindow: 200_000,
        goal: null,
        safetyVerdict: "ALLOW",
        safetyReason: "kernel gate active",
        workingMemory: [],
        telemetry: { tokens: 0, costUsd: 0, elapsed: "0s" },
        children: h(Text, null, "work"),
      }),
    );
    await tick();

    const out = inst.lastFrame();
    expect(out).toContain("/status");
    expect(out).toContain("local");
    expect(out).toContain("/commit");
    expect(out).toContain("approval");
    inst.unmount();
  });
});
