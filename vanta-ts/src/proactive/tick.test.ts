import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProactiveTick } from "./tick.js";
import { loadProactiveState, saveProactiveState } from "./store.js";
import { recordActivity, ProactiveConfigSchema, newProactiveState } from "./policy.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");
const config = ProactiveConfigSchema.parse({ enabled: true, minIdleMin: 15, minIntervalMin: 30, maxPerDay: 8 });

describe("runProactiveTick", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-proactive-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("runs the batch and records the tick when allowed", async () => {
    let ran = 0;
    const r = await runProactiveTick({
      dataDir: dir, now: NOW, config, queuedCount: 2, budgetExceeded: false,
      runBatch: async () => { ran = 3; return 3; },
    });
    expect(r.tick).toBe(true);
    expect(r.ran).toBe(3);
    expect(ran).toBe(3);
    expect((await loadProactiveState(dir)).ticksToday).toBe(1); // recorded
  });

  it("does not run the batch or record a tick when gated", async () => {
    let ran = false;
    const r = await runProactiveTick({
      dataDir: dir, now: NOW, config, queuedCount: 0, budgetExceeded: false,
      runBatch: async () => { ran = true; return 1; },
    });
    expect(r.tick).toBe(false);
    expect(r.ran).toBe(0);
    expect(ran).toBe(false);
    expect((await loadProactiveState(dir)).ticksToday).toBe(0); // not recorded
  });

  it("respects recently-recorded user activity (treats the user as present)", async () => {
    await saveProactiveState(dir, recordActivity(newProactiveState(), new Date(NOW.getTime() - 60_000))); // 1m ago
    let ran = false;
    const r = await runProactiveTick({
      dataDir: dir, now: NOW, config, queuedCount: 5, budgetExceeded: false,
      runBatch: async () => { ran = true; return 1; },
    });
    expect(r.tick).toBe(false);
    expect(ran).toBe(false);
  });
});
