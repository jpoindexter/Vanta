import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProactiveState, saveProactiveState, markProactiveActivity, proactivePath } from "./store.js";
import { newProactiveState } from "./policy.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

describe("proactive store", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "vanta-proactive-store-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns a fresh state when no file exists", async () => {
    expect(await loadProactiveState(dir)).toEqual(newProactiveState());
  });

  it("round-trips saved state", async () => {
    await saveProactiveState(dir, { ...newProactiveState(), ticksToday: 4, day: "2026-06-20" });
    const s = await loadProactiveState(dir);
    expect(s.ticksToday).toBe(4);
    expect(s.day).toBe("2026-06-20");
  });

  it("resets to fresh state on a corrupt file", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(proactivePath(dir), "not json", "utf8");
    expect(await loadProactiveState(dir)).toEqual(newProactiveState());
  });

  it("markProactiveActivity stamps the activity time", async () => {
    await markProactiveActivity(dir, NOW);
    expect((await loadProactiveState(dir)).lastUserActivityAt).toBe(NOW.toISOString());
  });
});
