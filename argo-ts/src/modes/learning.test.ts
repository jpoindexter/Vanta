import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { resolveArgoHome } from "../store/home.js";
import { normalizePattern, recordRun, shouldProposeSkill } from "./learning.js";

const HOME = join(tmpdir(), "argo-modes-learning-test");
const env = { ...process.env, VANTA_HOME: HOME };

describe("normalizePattern", () => {
  it("maps two phrasings of the same task to the same key", () => {
    // Differ only by case, punctuation, and filler words — significant words
    // ("refactor", "auth", "module") stay in the same order.
    const a = normalizePattern("Please refactor the auth module!");
    const b = normalizePattern("refactor auth module");
    expect(a).toBe(b);
    expect(a).toBe("refactor auth module");
  });

  it("keeps only the first ~8 significant words", () => {
    const key = normalizePattern(
      "build one two three four five six seven eight nine ten",
    );
    expect(key.split(" ")).toHaveLength(8);
    expect(key).toBe("build one two three four five six seven");
  });

  it("yields an empty key for all-filler input", () => {
    expect(normalizePattern("please can you just do it for me")).toBe("");
  });
});

describe("learning loop", () => {
  beforeEach(async () => {
    await rm(HOME, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(HOME, { recursive: true, force: true });
  });

  it("increments to 3 across similar instructions sharing a pattern", async () => {
    const r1 = await recordRun("Refactor the auth module", { env });
    const r2 = await recordRun("please refactor auth module!", { env });
    const r3 = await recordRun("REFACTOR the AUTH module", { env });

    expect(r1.pattern).toBe("refactor auth module");
    expect(r2.pattern).toBe(r1.pattern);
    expect(r3.pattern).toBe(r1.pattern);
    expect(r1.count).toBe(1);
    expect(r2.count).toBe(2);
    expect(r3.count).toBe(3);
  });

  it("keeps distinct patterns on separate counts", async () => {
    await recordRun("write the tests", { env });
    await recordRun("write the tests", { env });
    const other = await recordRun("deploy to production", { env });
    expect(other.count).toBe(1);
  });

  it("proposes at the threshold and returns null below it", async () => {
    await recordRun("summarize the report", { env });
    await recordRun("summarize report", { env });
    expect(await shouldProposeSkill("summarize the report", { env })).toBeNull();

    await recordRun("summarize report!", { env }); // count now 3
    const proposal = await shouldProposeSkill("summarize the report", { env });
    expect(proposal).not.toBeNull();
    expect(proposal).toContain("summarize report");
    expect(proposal).toContain("3 times");
  });

  it("honours a custom threshold", async () => {
    await recordRun("lint the code", { env });
    await recordRun("lint code", { env });
    expect(
      await shouldProposeSkill("lint the code", { env, threshold: 2 }),
    ).not.toBeNull();
  });

  it("returns null for an unseen pattern", async () => {
    expect(await shouldProposeSkill("never run before", { env })).toBeNull();
  });

  it("parses usage.tsv defensively, skipping malformed lines", async () => {
    await recordRun("seed pattern", { env }); // ensures store + a valid line
    const raw = [
      "valid pattern\t5",
      "bad-no-count",
      "\t9", // empty pattern
      "negative\t-2",
      "notnum\tabc",
      "valid pattern\t5",
    ].join("\n");
    await writeFile(join(resolveArgoHome(env), "usage.tsv"), raw, "utf8");

    const { count } = await recordRun("valid pattern", { env });
    expect(count).toBe(6); // parsed 5 + this run
  });
});
