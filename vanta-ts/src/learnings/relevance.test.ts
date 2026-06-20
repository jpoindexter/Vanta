import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { relevantLearnings, flagStale, findConflicts, learningsBlock, learningsDigest } from "./relevance.js";
import { addLearning, type Learning } from "./store.js";

const DAY = 86_400_000;
const NOW = 1_000 * DAY; // a fixed "now" well past epoch

function mk(over: Partial<Learning> & Pick<Learning, "id">): Learning {
  return {
    text: "",
    kind: "fact",
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("relevantLearnings", () => {
  it("returns top-3 by tag/keyword overlap, excluding superseded", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "Run the kernel before the agent", tags: ["kernel"] }),
      mk({ id: "b", text: "ESM uses .js import extensions", tags: ["esm", "imports"] }),
      mk({ id: "c", text: "Vitest co-located tests", tags: ["testing"] }),
      mk({ id: "d", text: "totally unrelated trivia", tags: ["misc"] }),
      mk({ id: "old", text: "kernel notes", tags: ["kernel"], supersededBy: "a" }),
    ];
    const top = relevantLearnings(learnings, "working on the kernel and esm imports", 3, { now: NOW });
    expect(top).toHaveLength(3);
    const ids = top.map((l) => l.id);
    expect(ids).toContain("a"); // kernel match
    expect(ids).toContain("b"); // esm + imports match (strongest)
    expect(ids).not.toContain("old"); // superseded excluded
  });

  it("ranks the strongest overlap first", () => {
    const learnings: Learning[] = [
      mk({ id: "weak", text: "kernel", tags: ["kernel"] }),
      mk({ id: "strong", text: "kernel sidecar approvals goals events", tags: ["kernel", "approvals", "goals"] }),
    ];
    const top = relevantLearnings(learnings, "kernel approvals goals events", 2, { now: NOW });
    expect(top[0]!.id).toBe("strong");
  });

  it("breaks ties toward recency when overlap is equal", () => {
    const learnings: Learning[] = [
      mk({ id: "old", text: "match term", tags: ["x"], updatedAt: NOW - 10 * DAY }),
      mk({ id: "fresh", text: "match term", tags: ["x"], updatedAt: NOW - 1 * DAY }),
    ];
    const top = relevantLearnings(learnings, "match term", 2, { now: NOW });
    expect(top[0]!.id).toBe("fresh");
  });

  it("falls back to recency when nothing overlaps", () => {
    const learnings: Learning[] = [
      mk({ id: "old", text: "alpha", tags: ["a"], updatedAt: NOW - 30 * DAY }),
      mk({ id: "new", text: "beta", tags: ["b"], updatedAt: NOW - 2 * DAY }),
    ];
    const top = relevantLearnings(learnings, "zzz nothing matches qqq", 1, { now: NOW });
    expect(top[0]!.id).toBe("new");
  });

  it("returns at most n", () => {
    const learnings = Array.from({ length: 10 }, (_, i) => mk({ id: `l${i}`, text: `item ${i}`, tags: ["t"] }));
    expect(relevantLearnings(learnings, "item", 3, { now: NOW })).toHaveLength(3);
  });
});

describe("flagStale", () => {
  it("flags entries older than maxAgeDays with their age", () => {
    const learnings: Learning[] = [
      mk({ id: "fresh", updatedAt: NOW - 10 * DAY }),
      mk({ id: "stale", updatedAt: NOW - 120 * DAY }),
    ];
    const flagged = flagStale(learnings, NOW, 90);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.learning.id).toBe("stale");
    expect(flagged[0]!.ageDays).toBe(120);
  });

  it("ignores superseded entries even when old", () => {
    const learnings: Learning[] = [mk({ id: "old", updatedAt: NOW - 200 * DAY, supersededBy: "x" })];
    expect(flagStale(learnings, NOW, 90)).toHaveLength(0);
  });

  it("returns [] when everything is fresh", () => {
    const learnings: Learning[] = [mk({ id: "a", updatedAt: NOW - 1 * DAY })];
    expect(flagStale(learnings, NOW, 90)).toEqual([]);
  });
});

describe("findConflicts", () => {
  it("surfaces two live same-tag entries with contradictory text", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "use npm", kind: "convention", tags: ["pkg-manager"] }),
      mk({ id: "b", text: "use pnpm", kind: "convention", tags: ["pkg-manager"] }),
    ];
    const conflicts = findConflicts(learnings);
    expect(conflicts).toHaveLength(1);
    expect([conflicts[0]!.a.id, conflicts[0]!.b.id].sort()).toEqual(["a", "b"]);
  });

  it("does not flag when one supersedes the other", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "use npm", tags: ["pkg-manager"], supersededBy: "b" }),
      mk({ id: "b", text: "use pnpm", tags: ["pkg-manager"] }),
    ];
    expect(findConflicts(learnings)).toHaveLength(0);
  });

  it("does not flag different tag sets", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "use npm", tags: ["pkg-manager"] }),
      mk({ id: "b", text: "use pnpm", tags: ["other"] }),
    ];
    expect(findConflicts(learnings)).toHaveLength(0);
  });

  it("ignores empty-tag entries (no shared tag set)", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "x", tags: [] }),
      mk({ id: "b", text: "y", tags: [] }),
    ];
    expect(findConflicts(learnings)).toHaveLength(0);
  });

  it("treats identical text under same tags as a duplicate, not a conflict", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "use npm", tags: ["pkg"] }),
      mk({ id: "b", text: "use npm", tags: ["pkg"] }),
    ];
    expect(findConflicts(learnings)).toHaveLength(0);
  });
});

describe("learningsBlock", () => {
  it("returns a header + up to 3 relevant bullets, flagging stale and conflicting", () => {
    const learnings: Learning[] = [
      mk({ id: "a", text: "use npm", kind: "convention", tags: ["pkg"] }),
      mk({ id: "b", text: "use pnpm", kind: "convention", tags: ["pkg"] }), // conflicts with a
      mk({ id: "c", text: "old pkg note", kind: "gotcha", tags: ["pkg"], updatedAt: NOW - 200 * DAY }), // stale
    ];
    const block = learningsBlock(learnings, "pkg", { now: NOW });
    expect(block).toContain("Project learnings (most relevant; verify before acting):");
    expect(block).toContain("⚠ conflicting");
    expect(block).toContain("⚠ stale");
    expect(block.split("\n")).toHaveLength(4); // header + 3 bullets
  });

  it("returns empty string when there are no learnings", () => {
    expect(learningsBlock([], "anything", { now: NOW })).toBe("");
  });
});

describe("learningsDigest", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads the store and frames the session block", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-learn-digest-"));
    await addLearning(dir, { text: "run git from repo root", kind: "gotcha", tags: ["git"] }, NOW);
    const out = await learningsDigest(dir, "working with git", NOW);
    expect(out).toContain("Project learnings");
    expect(out).toContain("run git from repo root");
  });

  it("returns empty string when the store is empty / missing", async () => {
    dir = await mkdtemp(join(tmpdir(), "vanta-learn-digest-"));
    expect(await learningsDigest(dir, "ctx", NOW)).toBe("");
  });
});
