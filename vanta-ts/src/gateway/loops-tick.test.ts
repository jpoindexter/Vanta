import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tickLoops } from "./loops-tick.js";
import { saveDef, saveState, loadState } from "../loop/store.js";
import { LoopDefSchema, newState } from "../loop/types.js";

// Build a minimal valid LoopDef via the schema parser.
function makeDef(id: string, trigger: object, status = "active") {
  return LoopDefSchema.parse({
    id,
    goal: "test goal",
    trigger,
    stages: [{ name: "run", prompt: "do it" }],
    status,
    createdAt: new Date().toISOString(),
  });
}

let dataDir: string;
const spawned: string[] = [];
const noop = () => {};

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "vanta-loops-tick-"));
  spawned.length = 0;
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

function deps(now: Date) {
  return {
    dataDir,
    now,
    spawn: (id: string) => spawned.push(id),
    log: noop,
  };
}

describe("tickLoops", () => {
  it("fires a heartbeat loop due on this tick", async () => {
    const def = makeDef("hb-due", { kind: "heartbeat", everyTicks: 1 });
    await saveDef(dataDir, def);
    await saveState(dataDir, newState(def.id));

    const now = new Date();
    const fired = await tickLoops(deps(now));

    expect(fired).toBe(1);
    expect(spawned).toEqual(["hb-due"]);
  });

  it("does not fire a heartbeat loop that is not yet due; advances tick counter", async () => {
    // everyTicks:3 — needs ticksSinceRun to reach 2 (0-indexed: 0+1=1 < 3-1=2)
    const def = makeDef("hb-notdue", { kind: "heartbeat", everyTicks: 3 });
    await saveDef(dataDir, def);
    const initial = newState(def.id); // ticksSinceRun = 0
    await saveState(dataDir, initial);

    const now = new Date();
    const fired = await tickLoops(deps(now));

    expect(fired).toBe(0);
    expect(spawned).toHaveLength(0);

    // Tick counter must have been persisted as 1.
    const after = await loadState(dataDir, def.id);
    expect(after.ticksSinceRun).toBe(1);
  });

  it("skips a paused loop even when the trigger would match", async () => {
    const def = makeDef("paused-hb", { kind: "heartbeat", everyTicks: 1 }, "paused");
    await saveDef(dataDir, def);
    await saveState(dataDir, newState(def.id));

    const fired = await tickLoops(deps(new Date()));

    expect(fired).toBe(0);
    expect(spawned).toHaveLength(0);
  });

  it("fires a cron loop whose expression matches now (local time)", async () => {
    // Construct a time we can target precisely: 2026-06-11 09:00 local.
    // isDue uses getHours()/getMinutes() — new Date(y,m,d,h,min) is local.
    const now = new Date(2026, 5, 11, 9, 0, 0); // June = month 5
    const def = makeDef("cron-match", { kind: "cron", expr: "0 9 * * *" });
    await saveDef(dataDir, def);
    await saveState(dataDir, newState(def.id));

    const fired = await tickLoops(deps(now));

    expect(fired).toBe(1);
    expect(spawned).toContain("cron-match");
  });

  it("does not fire a cron loop whose expression does not match; state unchanged", async () => {
    const now = new Date(2026, 5, 11, 10, 30, 0); // 10:30 — does not match "0 9 * * *"
    const def = makeDef("cron-miss", { kind: "cron", expr: "0 9 * * *" });
    await saveDef(dataDir, def);
    const initial = { ...newState(def.id) };
    await saveState(dataDir, initial);

    const fired = await tickLoops(deps(now));

    expect(fired).toBe(0);
    expect(spawned).toHaveLength(0);

    // Cron is not a heartbeat so advanceTick returns the same ref → no write.
    // The persisted state should remain as written (ticksSinceRun still 0).
    const after = await loadState(dataDir, def.id);
    expect(after.ticksSinceRun).toBe(0);
  });
});
