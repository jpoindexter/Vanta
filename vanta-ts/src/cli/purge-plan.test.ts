import { describe, it, expect } from "vitest";
import { join, resolve, sep } from "node:path";
import {
  buildPurgePlan,
  isPurgeConfirmed,
  formatPurgePlan,
  PURGE_STATE_PATHS,
  PURGE_CONFIRM_TOKEN,
  purgeCommandWiringPath,
  type PurgeDeps,
  type PurgeEntry,
} from "./purge-plan.js";

const DATA_DIR = "/tmp/proj/.vanta";

/** Build injected deps from a map of absolute-path → size (presence = exists). */
function depsFrom(sizes: Record<string, number | undefined>): PurgeDeps {
  return {
    exists: (path) => Object.prototype.hasOwnProperty.call(sizes, path),
    stat: (path) => sizes[path],
  };
}

describe("buildPurgePlan", () => {
  it("returns only the existing state entries under the data dir", () => {
    const events = join(DATA_DIR, "events.jsonl");
    const goals = join(DATA_DIR, "goals.tsv");
    const plan = buildPurgePlan(DATA_DIR, depsFrom({ [events]: 100, [goals]: 50 }));
    const paths = plan.map((e) => e.path);
    expect(paths).toEqual([events, goals]);
    expect(plan).toHaveLength(2);
  });

  it("carries kind and injected size onto each entry", () => {
    const events = join(DATA_DIR, "events.jsonl");
    const loops = join(DATA_DIR, "loops");
    const plan = buildPurgePlan(DATA_DIR, depsFrom({ [events]: 4096, [loops]: 8192 }));
    expect(plan).toContainEqual<PurgeEntry>({ path: events, kind: "file", sizeBytes: 4096 });
    expect(plan).toContainEqual<PurgeEntry>({ path: loops, kind: "dir", sizeBytes: 8192 });
  });

  it("omits sizeBytes when stat returns undefined", () => {
    const events = join(DATA_DIR, "events.jsonl");
    // exists via the key, but stat yields undefined
    const plan = buildPurgePlan(DATA_DIR, depsFrom({ [events]: undefined }));
    expect(plan).toEqual([{ path: events, kind: "file" }]);
    expect(plan[0]).not.toHaveProperty("sizeBytes");
  });

  it("skips state paths that do not exist", () => {
    const events = join(DATA_DIR, "events.jsonl");
    // only events exists; every other known path is absent
    const plan = buildPurgePlan(DATA_DIR, depsFrom({ [events]: 1 }));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.path).toBe(events);
  });

  it("returns [] for an empty/clean data dir (nothing exists)", () => {
    const plan = buildPurgePlan(DATA_DIR, depsFrom({}));
    expect(plan).toEqual([]);
  });

  it("every produced entry path is CONTAINED inside the data dir", () => {
    // make every known path 'exist' so the full set is considered
    const sizes: Record<string, number> = {};
    for (const { rel } of PURGE_STATE_PATHS) sizes[join(DATA_DIR, rel)] = 1;
    const plan = buildPurgePlan(DATA_DIR, depsFrom(sizes));
    const base = resolve(DATA_DIR);
    expect(plan.length).toBe(PURGE_STATE_PATHS.length);
    for (const e of plan) {
      const contained = e.path === base || e.path.startsWith(base + sep);
      expect(contained).toBe(true);
    }
  });

  it("excludes a path that would escape the data dir (containment guard)", () => {
    // A data dir whose only candidate resolves to its parent must NOT be produced.
    // We exercise the guard directly: a candidate that escapes is never returned.
    // Simulate by pointing the data dir at a path and asserting no entry leaves it.
    const escaping = resolve(DATA_DIR, "..", "events.jsonl"); // /tmp/proj/events.jsonl
    // Mark the escaping path as existing; it is NOT a rel under PURGE_STATE_PATHS
    // resolved inside DATA_DIR, so it can never be a plan entry.
    const plan = buildPurgePlan(DATA_DIR, depsFrom({ [escaping]: 999 }));
    expect(plan.every((e) => e.path !== escaping)).toBe(true);
    expect(plan).toEqual([]);
  });

  it("never produces a path outside the data dir even if a rel tried to traverse", () => {
    // Defense-in-depth: prove the contained-check rejects an escaping resolution.
    // resolve(base, "../x") leaves base; isContained must reject it. We assert the
    // invariant on the real candidate set: all resolved candidates stay inside.
    const base = resolve(DATA_DIR);
    for (const { rel } of PURGE_STATE_PATHS) {
      const abs = resolve(base, rel);
      const contained = abs === base || abs.startsWith(base + sep);
      expect(contained).toBe(true);
    }
  });
});

describe("isPurgeConfirmed", () => {
  it("accepts the exact token", () => {
    expect(isPurgeConfirmed(PURGE_CONFIRM_TOKEN)).toBe(true);
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(isPurgeConfirmed("  Purge Project State  ")).toBe(true);
    expect(isPurgeConfirmed("PURGE PROJECT STATE")).toBe(true);
  });

  it("rejects a bare y/yes", () => {
    expect(isPurgeConfirmed("y")).toBe(false);
    expect(isPurgeConfirmed("yes")).toBe(false);
    expect(isPurgeConfirmed("Y")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isPurgeConfirmed("")).toBe(false);
    expect(isPurgeConfirmed("   ")).toBe(false);
  });

  it("rejects a near-miss", () => {
    expect(isPurgeConfirmed("purge project")).toBe(false);
    expect(isPurgeConfirmed("purge project state now")).toBe(false);
    expect(isPurgeConfirmed("purge-project-state")).toBe(false);
  });
});

describe("formatPurgePlan", () => {
  it("lists items, kinds, paths, and per-item sizes", () => {
    const events = join(DATA_DIR, "events.jsonl");
    const loops = join(DATA_DIR, "loops");
    const text = formatPurgePlan([
      { path: events, kind: "file", sizeBytes: 2048 },
      { path: loops, kind: "dir", sizeBytes: 512 },
    ]);
    expect(text).toContain(events);
    expect(text).toContain(loops);
    expect(text).toContain("file");
    expect(text).toContain("dir");
    expect(text).toContain("2.0 KB"); // events size
    expect(text).toContain("512 B"); // loops size
  });

  it("reports the item count and the total size", () => {
    const text = formatPurgePlan([
      { path: join(DATA_DIR, "a"), kind: "file", sizeBytes: 1024 },
      { path: join(DATA_DIR, "b"), kind: "file", sizeBytes: 1024 },
    ]);
    expect(text).toContain("Would remove 2 items");
    expect(text).toContain("Total: 2 items, 2.0 KB");
  });

  it("includes the exact typed-token instruction", () => {
    const text = formatPurgePlan([{ path: join(DATA_DIR, "a"), kind: "file", sizeBytes: 1 }]);
    expect(text).toContain(`type exactly: ${PURGE_CONFIRM_TOKEN}`);
  });

  it("states plainly that nothing is deleted yet", () => {
    const text = formatPurgePlan([{ path: join(DATA_DIR, "a"), kind: "file", sizeBytes: 1 }]);
    expect(text.toLowerCase()).toContain("nothing is deleted yet");
    expect(text.toLowerCase()).toContain("dry run");
  });

  it("handles an empty plan as a clean-data-dir, not-deleted message", () => {
    const text = formatPurgePlan([]);
    expect(text.toLowerCase()).toContain("nothing to purge");
    expect(text.toLowerCase()).toContain("nothing is deleted");
    expect(text).not.toContain("type exactly");
  });

  it("singularizes for a one-item plan", () => {
    const text = formatPurgePlan([{ path: join(DATA_DIR, "a"), kind: "file", sizeBytes: 1 }]);
    expect(text).toContain("Would remove 1 item (");
    expect(text).not.toContain("Would remove 1 items");
  });
});

describe("purgeCommandWiringPath", () => {
  it("names the kernel .vanta data dir as the purge target root", () => {
    expect(purgeCommandWiringPath("/tmp/proj")).toBe(join("/tmp/proj", ".vanta"));
  });
});
