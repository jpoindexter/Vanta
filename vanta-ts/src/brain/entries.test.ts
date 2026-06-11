import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadEntries,
  saveEntries,
  upsertEntry,
  reinforceEntries,
  sweepDecayed,
  topEntries,
  entryScore,
  adjustedConfidence,
  crystalFor,
  isDecayed,
  normalizeEntry,
  entryId,
  entriesFile,
  formatEntry,
} from "./entries.js";

let home: string;
const prev = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-brain-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (prev === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prev;
  await rm(home, { recursive: true, force: true });
});

describe("normalizeEntry", () => {
  it("fills every axis with sane defaults", () => {
    const e = normalizeEntry({ region: "semantic", content: "Jason lives in Valencia" });
    expect(e.id).toBe(entryId("semantic", "Jason lives in Valencia"));
    expect(e.entryType).toBe("fact");
    expect(e.strength).toBe(0.5);
    expect(e.confidence).toBe(0.7);
    expect(e.salience).toBe(0.5);
    expect(e.valence).toBe(0);
    expect(e.retrievalCount).toBe(0);
    expect(e.crystalStatus).toBe("raw");
    expect(e.contradicts).toEqual([]);
  });

  it("clamps out-of-range axes instead of failing", () => {
    const e = normalizeEntry({ region: "r", content: "c", strength: 7, valence: -9 });
    expect(e.strength).toBe(1);
    expect(e.valence).toBe(-1);
  });
});

describe("load/save + tolerance", () => {
  it("returns [] when no store exists", async () => {
    expect(await loadEntries()).toEqual([]);
  });

  it("round-trips entries", async () => {
    await saveEntries([normalizeEntry({ region: "semantic", content: "a fact" })]);
    const loaded = await loadEntries();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.content).toBe("a fact");
  });

  it("drops malformed entries but keeps valid ones", async () => {
    await mkdir(join(home, "brain"), { recursive: true });
    await writeFile(
      entriesFile(),
      JSON.stringify([{ region: "semantic", content: "good" }, { nope: true }, 42]),
      "utf8",
    );
    const loaded = await loadEntries();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.content).toBe("good");
  });

  it("quarantines a corrupt store (copied, not deleted) and heals to empty", async () => {
    await mkdir(join(home, "brain"), { recursive: true });
    await writeFile(entriesFile(), "{corrupt!!", "utf8");
    expect(await loadEntries()).toEqual([]);
    const files = await readdir(join(home, "brain"));
    expect(files.some((f) => f.startsWith("entries.corrupt-"))).toBe(true);
    // Original bytes preserved in the quarantine copy.
    const quarantined = files.find((f) => f.startsWith("entries.corrupt-"))!;
    expect(await readFile(join(home, "brain", quarantined), "utf8")).toBe("{corrupt!!");
  });

  it("migrates the legacy brain5d.json store once, with stable ids", async () => {
    await writeFile(
      join(home, "brain5d.json"),
      JSON.stringify({ entries: [{ id: entryId("semantic", "old fact"), region: "semantic", content: "old fact", strength: 0.8 }] }),
      "utf8",
    );
    const loaded = await loadEntries();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(entryId("semantic", "old fact"));
    expect(loaded[0]?.strength).toBe(0.8);
    // Migration persisted to the new store.
    expect(JSON.parse(await readFile(entriesFile(), "utf8"))).toHaveLength(1);
  });
});

describe("upsert + reinforcement + decay", () => {
  it("re-asserting the same content strengthens instead of duplicating", async () => {
    await upsertEntry({ region: "user_model", content: "prefers terse output" });
    const e = await upsertEntry({ region: "user_model", content: "prefers terse output" });
    expect(e.strength).toBeCloseTo(0.6);
    expect(await loadEntries()).toHaveLength(1);
  });

  it("reinforce bumps retrieval count + strength and crystallizes at 3 and 10", async () => {
    const e = await upsertEntry({ region: "semantic", content: "x" });
    for (let i = 0; i < 3; i++) await reinforceEntries([e.id]);
    let [loaded] = await loadEntries();
    expect(loaded?.retrievalCount).toBe(3);
    expect(loaded?.crystalStatus).toBe("compressed");
    for (let i = 0; i < 7; i++) await reinforceEntries([e.id]);
    [loaded] = await loadEntries();
    expect(loaded?.crystalStatus).toBe("crystallized");
    expect(crystalFor(0)).toBe("raw");
  });

  it("decayed entries are excluded from topEntries and removed by sweep", async () => {
    await upsertEntry({ region: "mood", content: "transient", forgetAfter: "2000-01-01T00:00:00Z" });
    await upsertEntry({ region: "semantic", content: "durable" });
    const top = await topEntries();
    expect(top.map((e) => e.content)).toEqual(["durable"]);
    expect(await sweepDecayed()).toBe(1);
    expect(await loadEntries()).toHaveLength(1);
  });

  it("isDecayed is false without forgetAfter", () => {
    expect(isDecayed(normalizeEntry({ region: "r", content: "c" }))).toBe(false);
  });
});

describe("scoring (the cognitive axes)", () => {
  const now = new Date("2026-06-11T00:00:00Z");
  const base = () =>
    normalizeEntry({ region: "semantic", content: "c", updatedAt: now.toISOString() }, now);

  it("contradictions penalize confidence and ranking", () => {
    const clean = base();
    const conflicted = { ...base(), contradicts: ["a", "b"] };
    expect(adjustedConfidence(conflicted)).toBeCloseTo(0.4);
    expect(entryScore(conflicted, now)).toBeLessThan(entryScore(clean, now));
  });

  it("retrieval count and salience raise the score; age lowers it", () => {
    const used = { ...base(), retrievalCount: 9 };
    const salient = { ...base(), salience: 1 };
    const old = { ...base(), updatedAt: "2026-05-01T00:00:00Z" };
    expect(entryScore(used, now)).toBeGreaterThan(entryScore(base(), now));
    expect(entryScore(salient, now)).toBeGreaterThan(entryScore(base(), now));
    expect(entryScore(old, now)).toBeLessThan(entryScore(base(), now));
  });

  it("topEntries ranks by score and honors region/query filters", async () => {
    await upsertEntry({ region: "semantic", content: "weak note", strength: 0.2 });
    await upsertEntry({ region: "semantic", content: "strong fact about valencia", strength: 0.9 });
    await upsertEntry({ region: "mood", content: "calm" });
    const top = await topEntries({ topK: 2 });
    expect(top[0]?.content).toContain("strong fact");
    expect((await topEntries({ region: "mood" })).map((e) => e.content)).toEqual(["calm"]);
    expect((await topEntries({ query: "VALENCIA" }))[0]?.content).toContain("valencia");
  });

  it("formatEntry shows region, axes, and crystal/conflict tags", () => {
    const e = { ...base(), crystalStatus: "crystallized" as const, contradicts: ["x"] };
    const line = formatEntry(e);
    expect(line).toContain("[semantic|");
    expect(line).toContain("crystallized");
    expect(line).toContain("⚡conflict");
  });
});
