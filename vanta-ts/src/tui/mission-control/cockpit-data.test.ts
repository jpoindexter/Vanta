import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherCockpitData } from "./cockpit-data.js";
import { saveDef, saveState } from "../../loop/store.js";
import { newState, LoopDefSchema } from "../../loop/types.js";
import type { SafetyClient } from "../../safety-client.js";
import type { Goal } from "../../types.js";

// A fake SafetyClient — only getGoals is exercised by the cockpit loader.
function fakeClient(goals: Goal[] | Error): SafetyClient {
  return {
    getGoals: async () => {
      if (goals instanceof Error) throw goals;
      return goals;
    },
  } as unknown as SafetyClient;
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cockpit-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("gatherCockpitData", () => {
  it("returns live goals and loop summaries", async () => {
    await saveDef(dir, LoopDefSchema.parse({
      id: "nightly", goal: "keep green", trigger: { kind: "manual" },
      stages: [{ name: "s", prompt: "p" }],
      status: "active", createdAt: "2026-06-12T00:00:00Z",
    }));
    const state = { ...newState("nightly"), iterations: 3 };
    await saveState(dir, state);

    const data = await gatherCockpitData({ client: fakeClient([{ id: 1, text: "g", status: "active" }]), dataDir: dir });
    expect(data.goals).toHaveLength(1);
    expect(data.loops).toHaveLength(1);
    expect(data.loops[0]).toMatchObject({ id: "nightly", goal: "keep green", iterations: 3, openEscalations: 0 });
  });

  it("degrades to empty goals when the kernel call fails", async () => {
    const data = await gatherCockpitData({ client: fakeClient(new Error("kernel down")), dataDir: dir });
    expect(data.goals).toEqual([]);
    expect(data.loops).toEqual([]);
  });

  it("returns empty loops for a fresh data dir", async () => {
    const data = await gatherCockpitData({ client: fakeClient([]), dataDir: dir });
    expect(data.loops).toEqual([]);
  });
});
