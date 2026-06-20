import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectStall, checkLiveness, runWatchdog, resolveWatchdogConfig } from "./watchdog.js";
import { saveDef, saveState, loadDef, loadState } from "../loop/store.js";
import { LoopDefSchema, LoopStateSchema } from "../loop/types.js";
import { hasOpenEscalations } from "../loop/state.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");
const minsAgo = (m: number): string => new Date(NOW.getTime() - m * 60_000).toISOString();
const config = { stallMinutes: 30 };

function def(id: string) {
  return LoopDefSchema.parse({ id, goal: "g", trigger: { kind: "manual" }, stages: [{ name: "s", prompt: "p" }], createdAt: "2026-06-20T00:00:00.000Z" });
}
function state(id: string, over: Record<string, unknown>) {
  return LoopStateSchema.parse({ id, ...over });
}

describe("detectStall", () => {
  it("returns null when not in progress", () => {
    expect(detectStall(def("a"), state("a", { inProgress: false }), NOW, 30)).toBeNull();
  });
  it("returns null when in progress but no start time recorded", () => {
    expect(detectStall(def("a"), state("a", { inProgress: true, runStartedAt: null }), NOW, 30)).toBeNull();
  });
  it("returns null when the run is younger than the threshold", () => {
    expect(detectStall(def("a"), state("a", { inProgress: true, runStartedAt: minsAgo(5) }), NOW, 30)).toBeNull();
  });
  it("reports a run in progress past the threshold", () => {
    const r = detectStall(def("a"), state("a", { inProgress: true, runStartedAt: minsAgo(40) }), NOW, 30);
    expect(r?.loopId).toBe("a");
    expect(Math.round(r!.stalledForMin)).toBe(40);
  });
});

describe("watchdog over the store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-watchdog-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("checkLiveness reports only the stalled loop", async () => {
    await saveDef(dir, def("stuck"));
    await saveState(dir, state("stuck", { inProgress: true, runStartedAt: minsAgo(40) }));
    await saveDef(dir, def("healthy"));
    await saveState(dir, state("healthy", { inProgress: false, lastRunAt: minsAgo(1) }));
    const reports = await checkLiveness(dir, NOW, config);
    expect(reports.map((r) => r.loopId)).toEqual(["stuck"]);
  });

  it("runWatchdog escalates + pauses a stalled loop, idempotently", async () => {
    await saveDef(dir, def("stuck"));
    await saveState(dir, state("stuck", { inProgress: true, runStartedAt: minsAgo(40) }));

    const first = await runWatchdog(dir, NOW, config);
    expect(first.surfaced).toBe(1);
    expect(hasOpenEscalations(await loadState(dir, "stuck"))).toBe(true);
    expect((await loadDef(dir, "stuck"))?.status).toBe("paused");

    const second = await runWatchdog(dir, NOW, config);
    expect(second.surfaced).toBe(0); // already surfaced
  });
});

describe("resolveWatchdogConfig", () => {
  it("defaults to 30m and reads the override", () => {
    expect(resolveWatchdogConfig({} as NodeJS.ProcessEnv).stallMinutes).toBe(30);
    expect(resolveWatchdogConfig({ VANTA_WATCHDOG_STALL_MIN: "10" } as NodeJS.ProcessEnv).stallMinutes).toBe(10);
  });
});
