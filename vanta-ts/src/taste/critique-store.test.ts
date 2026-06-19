import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readModel, writeModel, appendCritique, readCritiques, critiquesFor,
  defaultModel, slugProject, BRAND_SAFE_DEFAULTS, type Critique,
} from "./critique-store.js";

describe("taste critique-store", () => {
  let home: string;
  let prev: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-taste-"));
    prev = process.env.VANTA_HOME;
    process.env.VANTA_HOME = home;
  });
  afterEach(async () => {
    if (prev === undefined) delete process.env.VANTA_HOME; else process.env.VANTA_HOME = prev;
    await rm(home, { recursive: true, force: true });
  });

  it("seeds brand-safe defaults when no model exists", async () => {
    const m = await readModel();
    expect(m.project).toBe("default");
    expect(m.brand.avoid).toContain("blue-to-purple gradients");
    expect(m.brand).toEqual(BRAND_SAFE_DEFAULTS);
    expect(m.weights.usefulness).toBeGreaterThan(0);
  });

  it("persists and reloads a learned preference", async () => {
    const m = defaultModel("default");
    m.preferences.push("dense terminal-native layouts");
    await writeModel(m);
    const reloaded = await readModel();
    expect(reloaded.preferences).toContain("dense terminal-native layouts");
  });

  it("merges defaults over a partial stored model", async () => {
    // Simulate an older model file missing a weight key.
    const m = defaultModel("default");
    delete (m.weights as Record<string, number>).beauty;
    await writeModel(m);
    const reloaded = await readModel();
    expect(reloaded.weights.beauty).toBeGreaterThan(0); // backfilled from defaults
  });

  it("scopes per-project models to separate files", async () => {
    const indx = defaultModel("indx");
    indx.preferences.push("indx-only pref");
    await writeModel(indx);
    expect((await readModel("indx")).preferences).toContain("indx-only pref");
    expect((await readModel("default")).preferences).not.toContain("indx-only pref");
  });

  it("appends critiques and filters the before/after trail by artifact", async () => {
    const base: Omit<Critique, "phase" | "ts"> = {
      kind: "critique", project: "default", artifact: "hero.html",
      scores: { clarity: 0.5, usefulness: 0.5, beauty: 0.5, credibility: 0.5, actionability: 0.5 },
      overall: 0.5, notes: ["n"],
    };
    await appendCritique({ ...base, phase: "before", ts: "2026-01-01T00:00:00Z" });
    await appendCritique({ ...base, artifact: "other.md", phase: "single", ts: "2026-01-02T00:00:00Z" });
    await appendCritique({ ...base, phase: "after", ts: "2026-01-03T00:00:00Z" });
    const all = await readCritiques();
    expect(all).toHaveLength(3);
    const trail = critiquesFor(all, "default", "hero.html");
    expect(trail.map((c) => c.phase)).toEqual(["before", "after"]);
  });

  it("slugifies project names safely (no traversal)", () => {
    expect(slugProject("../../etc")).toBe("etc");
    expect(slugProject("My Project!")).toBe("my-project");
    expect(slugProject("")).toBe("default");
  });

  it("returns empty critiques when none recorded", async () => {
    expect(await readCritiques()).toEqual([]);
  });
});
