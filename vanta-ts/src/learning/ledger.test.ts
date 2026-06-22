import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordLearning, readLearning, learningStats, type LearningEvent } from "./ledger.js";

const ev = (over: Partial<LearningEvent>): LearningEvent => ({
  ts: "2026-06-22T00:00:00Z",
  skill: "debug-vitest",
  kind: "minted",
  adopted: true,
  reason: "ok",
  ...over,
});

describe("ledger round-trip", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "learning-ledger-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends and reads back events in order", async () => {
    await recordLearning(dir, ev({ skill: "a" }));
    await recordLearning(dir, ev({ skill: "b", kind: "refined" }));
    const events = await readLearning(dir);
    expect(events.map((e) => e.skill)).toEqual(["a", "b"]);
  });

  it("returns [] for a missing ledger and skips corrupt rows", async () => {
    expect(await readLearning(dir)).toEqual([]);
    await recordLearning(dir, ev({ skill: "good" }));
    // corrupt the file with a junk line
    const { appendFile } = await import("node:fs/promises");
    await appendFile(join(dir, "learning", "ledger.jsonl"), "{ not json\n", "utf8");
    const events = await readLearning(dir);
    expect(events.map((e) => e.skill)).toEqual(["good"]);
  });
});

describe("learningStats", () => {
  it("counts mints/refines/adopt/reject and the adoption rate", () => {
    const s = learningStats([
      ev({ skill: "a", kind: "minted", adopted: true }),
      ev({ skill: "a", kind: "refined", adopted: true }),
      ev({ skill: "b", kind: "minted", adopted: false }),
    ]);
    expect(s).toMatchObject({ cycles: 3, minted: 2, refined: 1, adopted: 2, rejected: 1, distinctSkills: 2 });
    expect(s.adoptionRate).toBeCloseTo(2 / 3);
  });

  it("adoptionRate is null with no cycles", () => {
    expect(learningStats([]).adoptionRate).toBeNull();
  });
});
