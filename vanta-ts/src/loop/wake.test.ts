import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LoopDefSchema, newState } from "./types.js";
import {
  decodeWakeContext,
  drainLoopWakes,
  encodeWakeContext,
  enqueueLoopWake,
  formatWakeContext,
  wakeContextFromLoop,
} from "./wake.js";

describe("wake context", () => {
  it("formats the compact wake envelope and delta", () => {
    const text = formatWakeContext({
      wake_reason: "approval.resolved",
      goal_id: "ship-loop",
      approval_id: "esc-1",
      since: "2026-06-18T10:00:00.000Z",
      delta: ["cleared esc-1: needs key"],
    });

    expect(text).toContain('"wake_reason":"approval.resolved"');
    expect(text).toContain("Delta since last wake:");
    expect(text).toContain("- cleared esc-1: needs key");
  });

  it("encodes and decodes validated env payloads", () => {
    const wake = { wake_reason: "manual", goal_id: "loop-a", since: null, delta: ["x"] };
    expect(decodeWakeContext(encodeWakeContext(wake))).toEqual(wake);
    expect(decodeWakeContext("{bad")).toBeNull();
  });

  it("builds loop deltas from state without full history", () => {
    const def = LoopDefSchema.parse({
      id: "loop-a",
      goal: "ship",
      trigger: { kind: "heartbeat", everyTicks: 3 },
      stages: [{ name: "run", prompt: "go" }],
      createdAt: "2026-06-18T00:00:00.000Z",
    });
    const state = {
      ...newState("loop-a"),
      iterations: 2,
      lastRunAt: "2026-06-18T09:00:00.000Z",
      history: [{ at: "2026-06-18T09:00:00.000Z", score: 0.7, note: "iteration 2 complete" }],
    };

    const wake = wakeContextFromLoop(def, state, new Date("2026-06-18T10:00:00.000Z"));

    expect(wake).toMatchObject({
      wake_reason: "heartbeat:3",
      goal_id: "loop-a",
      since: "2026-06-18T09:00:00.000Z",
    });
    expect(wake.delta).toContain("iterations=2");
    expect(wake.delta).toContain("last_outcome=iteration 2 complete");
  });

  it("round-trips queued loop wakes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-wake-"));
    try {
      await enqueueLoopWake(dir, { wake_reason: "approval.resolved", goal_id: "a", since: null, delta: [] });
      await enqueueLoopWake(dir, { wake_reason: "manual", goal_id: "b", since: null, delta: ["run"] });

      expect((await drainLoopWakes(dir)).map((w) => w.goal_id)).toEqual(["a", "b"]);
      expect(await drainLoopWakes(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
