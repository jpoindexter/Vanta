import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consolidate, maybeConsolidate, mergeDuplicates, resolveMaxEntries } from "./consolidate.js";
import { loadEntries, saveEntries, normalizeEntry, upsertEntry, entryScore } from "./entries.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-consol-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("resolveMaxEntries", () => {
  it("defaults to 400, honors the env, floors at 50", () => {
    expect(resolveMaxEntries({} as NodeJS.ProcessEnv)).toBe(400);
    expect(resolveMaxEntries({ VANTA_BRAIN_MAX_ENTRIES: "120" } as NodeJS.ProcessEnv)).toBe(120);
    expect(resolveMaxEntries({ VANTA_BRAIN_MAX_ENTRIES: "3" } as NodeJS.ProcessEnv)).toBe(400);
  });
});

describe("mergeDuplicates", () => {
  it("merges near-identical memories in a region into one stronger gist", () => {
    const a = normalizeEntry({ region: "user_model", content: "jason prefers terse bullet output always", strength: 0.8, retrievalCount: 2 });
    const b = normalizeEntry({ region: "user_model", content: "jason prefers terse bullet output", strength: 0.5, retrievalCount: 2 });
    const c = normalizeEntry({ region: "user_model", content: "completely different gardening note" });
    const r = mergeDuplicates([a, b, c]);
    expect(r.merged).toBe(1);
    expect(r.entries).toHaveLength(2);
    const gist = r.entries.find((e) => e.content.includes("terse"))!;
    expect(gist.strength).toBeCloseTo(0.85); // max(0.8, 0.5) + 0.05
    expect(gist.retrievalCount).toBe(4); // reinforcement carried over
    expect(gist.crystalStatus).toBe("compressed"); // 4 retrievals
    expect(gist.sourceType).toBe("crystallized"); // marked as a consolidated gist
    expect(r.remap.get(b.id)).toBe(a.id);
  });

  it("never merges across regions", () => {
    const a = normalizeEntry({ region: "semantic", content: "kernel gates every tool call" });
    const b = normalizeEntry({ region: "episodic", content: "kernel gates every tool call" });
    expect(mergeDuplicates([a, b]).merged).toBe(0);
  });
});

describe("consolidate (the sleep pass)", () => {
  it("merges, sweeps decayed, and enforces the budget — links healed", async () => {
    const dupA = normalizeEntry({ region: "semantic", content: "vanta runs fully local on the mac", strength: 0.9 });
    const dupB = normalizeEntry({ region: "semantic", content: "vanta runs fully local on mac", strength: 0.4 });
    // c links to the duplicate that will be absorbed — must be re-pointed to the survivor.
    const c = normalizeEntry({ region: "semantic", content: "local models keep tokens free", relatedIds: [dupB.id] });
    const dead = normalizeEntry({ region: "mood", content: "fleeting", forgetAfter: "2000-01-01T00:00:00Z" });
    const weak = normalizeEntry({ region: "mood", content: "weak old note", strength: 0.05, updatedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" });
    await saveEntries([dupA, dupB, c, dead, weak]);

    const report = await consolidate({ maxEntries: 2 });
    expect(report.merged).toBe(1);
    expect(report.sweptDecayed).toBe(1);
    expect(report.droppedWeak).toBe(1); // budget of 2: weakest live entry goes
    expect(report.kept).toBe(2);

    const after = await loadEntries();
    expect(after).toHaveLength(2);
    const cAfter = after.find((e) => e.content.includes("tokens free"))!;
    expect(cAfter.relatedIds).toEqual([dupA.id]); // remapped to the survivor, no dangling
    // The strongest memories survived.
    expect(after.map((e) => e.content).join(" ")).toContain("fully local");
  });

  it("is a no-op save when nothing changed", async () => {
    await upsertEntry({ region: "semantic", content: "single stable fact" });
    const report = await consolidate({});
    expect(report).toMatchObject({ merged: 0, sweptDecayed: 0, droppedWeak: 0, kept: 1 });
  });

  it("maybeConsolidate runs only over budget", async () => {
    await upsertEntry({ region: "semantic", content: "one" });
    expect(await maybeConsolidate(process.env)).toBeNull(); // under 400
    process.env.VANTA_BRAIN_MAX_ENTRIES = "50";
    try {
      for (let i = 0; i < 55; i++) {
        await upsertEntry({ region: "semantic", content: `unique memory number ${i} ${"pad".repeat(i % 3)}` });
      }
      const report = await maybeConsolidate(process.env);
      expect(report).not.toBeNull();
      expect((await loadEntries()).length).toBeLessThanOrEqual(50);
    } finally {
      delete process.env.VANTA_BRAIN_MAX_ENTRIES;
    }
  });
});

describe("access recency in scoring", () => {
  it("a recently-recalled old memory outranks an untouched one of equal strength", () => {
    const now = new Date("2026-06-11T00:00:00Z");
    const old = normalizeEntry({ region: "semantic", content: "a", updatedAt: "2026-04-01T00:00:00Z" });
    const recalled = normalizeEntry({ region: "semantic", content: "b", updatedAt: "2026-04-01T00:00:00Z", accessedAt: "2026-06-10T00:00:00Z" });
    expect(entryScore(recalled, now)).toBeGreaterThan(entryScore(old, now));
  });
});
