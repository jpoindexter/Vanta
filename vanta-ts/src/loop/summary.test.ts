import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveDef, saveState } from "./store.js";
import { LoopDefSchema, newState } from "./types.js";
import type { LoopDef, LoopState } from "./types.js";
import { listLoopSummaries } from "./summary.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-loop-summary-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeDef(id: string, status: LoopDef["status"] = "active", createdAt = "2026-06-11T00:00:00.000Z"): LoopDef {
  return LoopDefSchema.parse({
    id,
    goal: `goal ${id}`,
    trigger: { kind: "heartbeat", everyTicks: 1 },
    stages: [{ name: "execute", prompt: "do the thing" }],
    status,
    createdAt,
  });
}

function makeState(id: string, overrides: Partial<LoopState> = {}): LoopState {
  return { ...newState(id), ...overrides };
}

describe("listLoopSummaries", () => {
  it("returns empty list when there are no loops", async () => {
    const result = await listLoopSummaries(dir);
    expect(result).toEqual([]);
  });

  it("maps def + state into a flat LoopSummary", async () => {
    const def = makeDef("alpha");
    const state = makeState("alpha", { iterations: 5, lastScore: 0.75, bestScore: 0.8 });
    await saveDef(dir, def);
    await saveState(dir, state);

    const result = await listLoopSummaries(dir);
    expect(result).toHaveLength(1);
    const s = result[0]!;
    expect(s.id).toBe("alpha");
    expect(s.goal).toBe("goal alpha");
    expect(s.status).toBe("active");
    expect(s.iterations).toBe(5);
    expect(s.lastScore).toBe(0.75);
    expect(s.bestScore).toBe(0.8);
    expect(s.inProgress).toBe(false);
    expect(s.openEscalations).toBe(0);
  });

  it("counts only open escalations", async () => {
    const def = makeDef("beta");
    const state = makeState("beta", {
      escalations: [
        { id: "e1", raisedAt: "2026-06-11T00:00:00.000Z", reason: "blocked", status: "open", clearedAt: null },
        { id: "e2", raisedAt: "2026-06-11T00:00:00.000Z", reason: "fixed", status: "cleared", clearedAt: "2026-06-11T01:00:00.000Z" },
      ],
    });
    await saveDef(dir, def);
    await saveState(dir, state);

    const result = await listLoopSummaries(dir);
    expect(result[0]!.openEscalations).toBe(1);
  });

  it("sorts active/in-progress first, then paused, then done/killed", async () => {
    await saveDef(dir, makeDef("done-loop", "done", "2026-06-09T00:00:00.000Z"));
    await saveDef(dir, makeDef("paused-loop", "paused", "2026-06-10T00:00:00.000Z"));
    await saveDef(dir, makeDef("active-loop", "active", "2026-06-08T00:00:00.000Z"));
    await saveDef(dir, makeDef("killed-loop", "killed", "2026-06-11T00:00:00.000Z"));

    const state = makeState("active-loop", { inProgress: true });
    await saveState(dir, state);

    const result = await listLoopSummaries(dir);
    const ids = result.map((s) => s.id);
    expect(ids[0]).toBe("active-loop");
    expect(ids[1]).toBe("paused-loop");
    // done and killed follow, order between them doesn't matter
    expect(ids.slice(2)).toContain("done-loop");
    expect(ids.slice(2)).toContain("killed-loop");
  });

  it("active (not inProgress) also sorts before paused", async () => {
    await saveDef(dir, makeDef("paused-one", "paused", "2026-06-11T00:00:00.000Z"));
    await saveDef(dir, makeDef("active-one", "active", "2026-06-10T00:00:00.000Z"));

    const result = await listLoopSummaries(dir);
    expect(result[0]!.id).toBe("active-one");
    expect(result[1]!.id).toBe("paused-one");
  });
});
