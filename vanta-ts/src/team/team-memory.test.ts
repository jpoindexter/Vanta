import { describe, it, expect } from "vitest";
import {
  appendTeamMemory,
  readTeamMemory,
  parseTeamMemory,
  resolveTeamId,
  sanitizeTeamId,
  teamMemoryDigest,
  type TeamMemoryEntry,
  type TeamMemoryDeps,
} from "./team-memory.js";

/** In-memory team-memory deps: one mutable JSONL "file" + an injected clock. */
function makeDeps(opts: {
  initial?: string | null;
  now?: string;
  failRead?: boolean;
  failAppend?: boolean;
} = {}): TeamMemoryDeps & { content: () => string | null } {
  let file: string | null = opts.initial ?? null;
  return {
    read: async () => {
      if (opts.failRead) throw new Error("read boom");
      return file;
    },
    append: async (line) => {
      if (opts.failAppend) throw new Error("append boom");
      file = (file ?? "") + line;
    },
    now: () => new Date(opts.now ?? "2026-06-20T12:00:00.000Z"),
    content: () => file,
  };
}

describe("resolveTeamId — VANTA_TEAM_ID, null when unset", () => {
  it("returns the team id when set", () => {
    expect(resolveTeamId({ VANTA_TEAM_ID: "alpha" })).toBe("alpha");
  });

  it("returns null when unset (no shared memory → isolated)", () => {
    expect(resolveTeamId({})).toBeNull();
  });

  it("returns null for a whitespace-only value", () => {
    expect(resolveTeamId({ VANTA_TEAM_ID: "   " })).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(resolveTeamId({ VANTA_TEAM_ID: "  beta  " })).toBe("beta");
  });
});

describe("sanitizeTeamId — no path traversal into the filename", () => {
  it("strips a leading-dot traversal attempt", () => {
    expect(sanitizeTeamId("../../etc/passwd")).toBe("etcpasswd");
  });

  it("strips path separators", () => {
    expect(sanitizeTeamId("a/b\\c")).toBe("abc");
  });

  it("strips an absolute-path leading slash", () => {
    expect(sanitizeTeamId("/root/team")).toBe("rootteam");
  });

  it("lowercases and slugifies spaces", () => {
    expect(sanitizeTeamId("Team Alpha")).toBe("team-alpha");
  });

  it("falls back to 'unnamed-team' for an all-garbage id", () => {
    expect(sanitizeTeamId("../")).toBe("unnamed-team");
    expect(sanitizeTeamId("")).toBe("unnamed-team");
  });

  it("never produces a separator or dot that could escape the dir", () => {
    for (const id of ["..", "../x", "/x", "x/..", "a\\b/c", "...."]) {
      const slug = sanitizeTeamId(id);
      expect(slug).not.toMatch(/[/\\]/);
      expect(slug).not.toContain("..");
    }
  });
});

describe("parseTeamMemory — tolerant reader", () => {
  it("returns [] for a missing file (null)", () => {
    expect(parseTeamMemory(null)).toEqual([]);
  });

  it("returns [] for empty content", () => {
    expect(parseTeamMemory("")).toEqual([]);
  });

  it("drops non-JSON lines, keeps valid ones", () => {
    const raw = [
      JSON.stringify({ ts: "t1", author: "w1", note: "found a bug" }),
      "{not json",
      JSON.stringify({ ts: "t2", author: "w2", note: "fixed it", tags: ["fix"] }),
    ].join("\n");
    const parsed = parseTeamMemory(raw);
    expect(parsed).toEqual([
      { ts: "t1", author: "w1", note: "found a bug" },
      { ts: "t2", author: "w2", note: "fixed it", tags: ["fix"] },
    ]);
  });

  it("drops rows that fail the schema (missing required field)", () => {
    const raw = [
      JSON.stringify({ ts: "t1", author: "w1", note: "ok" }),
      JSON.stringify({ ts: "t2", author: "w2" }), // missing note
      JSON.stringify({ author: "w3", note: "no ts" }), // missing ts
    ].join("\n");
    expect(parseTeamMemory(raw)).toEqual([{ ts: "t1", author: "w1", note: "ok" }]);
  });

  it("ignores blank lines between rows", () => {
    const raw = `${JSON.stringify({ ts: "t", author: "a", note: "n" })}\n\n\n`;
    expect(parseTeamMemory(raw)).toHaveLength(1);
  });
});

describe("appendTeamMemory → readTeamMemory round-trip", () => {
  it("appends an entry with an injected ts, then reads it back", async () => {
    const deps = makeDeps();
    const ok = await appendTeamMemory("alpha", { author: "w1", note: "discovered X" }, deps);
    expect(ok).toBe(true);
    const entries = await readTeamMemory("alpha", deps);
    expect(entries).toEqual([
      { ts: "2026-06-20T12:00:00.000Z", author: "w1", note: "discovered X" },
    ]);
  });

  it("makes a sibling's finding visible to the next reader (shared namespace)", async () => {
    const deps = makeDeps();
    await appendTeamMemory("alpha", { author: "w1", note: "first" }, deps);
    await appendTeamMemory("alpha", { author: "w2", note: "second", tags: ["t"] }, deps);
    const entries = await readTeamMemory("alpha", deps);
    expect(entries.map((e) => `${e.author}:${e.note}`)).toEqual(["w1:first", "w2:second"]);
    expect(entries[1]?.tags).toEqual(["t"]);
  });

  it("honours an explicit ts when provided", async () => {
    const deps = makeDeps();
    await appendTeamMemory("a", { author: "w", note: "n", ts: "2020-01-01T00:00:00.000Z" }, deps);
    expect((await readTeamMemory("a", deps))[0]?.ts).toBe("2020-01-01T00:00:00.000Z");
  });

  it("omits tags when not provided", async () => {
    const deps = makeDeps();
    await appendTeamMemory("a", { author: "w", note: "n" }, deps);
    expect((await readTeamMemory("a", deps))[0]).not.toHaveProperty("tags");
  });
});

describe("appendTeamMemory — best-effort, never throws into the worker", () => {
  it("returns false (does not throw) when the append fails", async () => {
    const deps = makeDeps({ failAppend: true });
    await expect(
      appendTeamMemory("a", { author: "w", note: "n" }, deps),
    ).resolves.toBe(false);
  });
});

describe("readTeamMemory — tolerant, never throws", () => {
  it("returns [] on a missing namespace (no file yet → isolated)", async () => {
    const deps = makeDeps({ initial: null });
    expect(await readTeamMemory("never-written", deps)).toEqual([]);
  });

  it("returns [] when the read fails", async () => {
    const deps = makeDeps({ failRead: true });
    expect(await readTeamMemory("a", deps)).toEqual([]);
  });
});

describe("teamMemoryDigest — compact recent-N digest", () => {
  const mk = (n: number): TeamMemoryEntry[] =>
    Array.from({ length: n }, (_, i) => ({ ts: `t${i}`, author: `w${i}`, note: `note ${i}` }));

  it("returns '' for no entries", () => {
    expect(teamMemoryDigest([])).toBe("");
  });

  it("renders one line per entry with author and note", () => {
    const out = teamMemoryDigest([{ ts: "t", author: "w1", note: "found X" }]);
    expect(out).toContain("• [w1] found X");
  });

  it("includes tags when present", () => {
    const out = teamMemoryDigest([{ ts: "t", author: "w1", note: "n", tags: ["a", "b"] }]);
    expect(out).toContain("• [w1] n #a #b");
  });

  it("caps to the most recent N (last N entries, in order)", () => {
    const out = teamMemoryDigest(mk(20), 3);
    expect(out).toContain("note 17");
    expect(out).toContain("note 18");
    expect(out).toContain("note 19");
    expect(out).not.toContain("note 16");
    expect(out).toContain("(3 recent)");
  });

  it("returns '' when max is 0 or negative", () => {
    expect(teamMemoryDigest(mk(5), 0)).toBe("");
    expect(teamMemoryDigest(mk(5), -1)).toBe("");
  });

  it("defaults to 10 recent when no max is given", () => {
    const out = teamMemoryDigest(mk(25));
    expect(out).toContain("(10 recent)");
    expect(out).toContain("note 24");
    expect(out).not.toContain("note 14");
  });
});
