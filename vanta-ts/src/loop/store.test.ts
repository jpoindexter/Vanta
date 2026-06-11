import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveDef, loadDef, listDefs, saveState, loadState, removeLoop, loopsDir, isValidLoopId } from "./store.js";
import { LoopDefSchema, newState } from "./types.js";
import type { LoopDef } from "./types.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-loop-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeDef(id: string, createdAt = "2026-06-11T00:00:00.000Z"): LoopDef {
  return LoopDefSchema.parse({
    id,
    goal: `goal ${id}`,
    trigger: { kind: "heartbeat", everyTicks: 1 },
    stages: [{ name: "execute", prompt: "do the thing" }],
    createdAt,
  });
}

describe("loop store", () => {
  it("round-trips a def through save/load", async () => {
    const def = makeDef("alpha");
    await saveDef(dir, def);
    expect(await loadDef(dir, "alpha")).toEqual(def);
  });

  it("returns null for an unknown def", async () => {
    expect(await loadDef(dir, "ghost")).toBeNull();
  });

  it("lists defs newest-created first and skips malformed files", async () => {
    await saveDef(dir, makeDef("old", "2026-06-01T00:00:00.000Z"));
    await saveDef(dir, makeDef("new", "2026-06-10T00:00:00.000Z"));
    await mkdir(loopsDir(dir), { recursive: true });
    await writeFile(join(loopsDir(dir), "broken.json"), "{ not json", "utf8");
    const ids = (await listDefs(dir)).map((d) => d.id);
    expect(ids).toEqual(["new", "old"]);
  });

  it("returns [] when the loops dir does not exist", async () => {
    expect(await listDefs(dir)).toEqual([]);
  });

  it("round-trips state and defaults to fresh zeroed state when absent", async () => {
    const fresh = await loadState(dir, "beta");
    expect(fresh).toEqual(newState("beta"));
    const advanced = { ...fresh, iterations: 3, lastScore: 0.5 };
    await saveState(dir, advanced);
    expect(await loadState(dir, "beta")).toEqual(advanced);
  });

  it("resets to fresh state when the state file is corrupt", async () => {
    await mkdir(loopsDir(dir), { recursive: true });
    await writeFile(join(loopsDir(dir), "gamma.state.json"), "garbage", "utf8");
    expect(await loadState(dir, "gamma")).toEqual(newState("gamma"));
  });

  it("removeLoop deletes both def and state", async () => {
    const def = makeDef("delta");
    await saveDef(dir, def);
    await saveState(dir, newState("delta"));
    await removeLoop(dir, "delta");
    expect(await loadDef(dir, "delta")).toBeNull();
    expect((await listDefs(dir)).length).toBe(0);
  });

  it("a def file is not mistaken for a state file when listing", async () => {
    await saveDef(dir, makeDef("epsilon"));
    await saveState(dir, newState("epsilon"));
    expect((await listDefs(dir)).map((d) => d.id)).toEqual(["epsilon"]);
  });
});

describe("isValidLoopId", () => {
  it("accepts lowercase kebab ids", () => {
    expect(isValidLoopId("ship-readme")).toBe(true);
    expect(isValidLoopId("a")).toBe(true);
  });
  it("rejects uppercase, spaces, leading dash, and overlong ids", () => {
    expect(isValidLoopId("Ship")).toBe(false);
    expect(isValidLoopId("two words")).toBe(false);
    expect(isValidLoopId("-lead")).toBe(false);
    expect(isValidLoopId("x".repeat(65))).toBe(false);
  });
});
