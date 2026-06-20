import { describe, it, expect } from "vitest";
import {
  adoptSkill,
  getEntry,
  listEntriesSorted,
  publishSkill,
  readExchange,
  skillsForDepartment,
  writeExchange,
  type ExchangeEntry,
  type ExchangeStoreFs,
} from "./skill-exchange.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");
const LATER = new Date("2026-06-20T13:00:00.000Z");

/** Publish then unwrap, throwing on the errors-as-values failure path. */
function publishOk(entries: ExchangeEntry[], skillId: string, byDept: string, now = NOW): ExchangeEntry[] {
  const r = publishSkill(entries, skillId, byDept, now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function adoptOk(entries: ExchangeEntry[], skillId: string, byDept: string, now = NOW): ExchangeEntry[] {
  const r = adoptSkill(entries, skillId, byDept, now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("publishSkill", () => {
  it("creates an entry owned by the publishing department", () => {
    const entries = publishOk([], "design-tokens", "design");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ skillId: "design-tokens", publishedBy: "design", adopters: [] });
    expect(entries[0]?.createdAt).toBe(NOW.toISOString());
  });

  it("references the skill by slug — does not store a body", () => {
    const entries = publishOk([], "design-tokens", "design");
    expect(Object.keys(entries[0]!)).toEqual(["skillId", "publishedBy", "adopters", "createdAt", "updatedAt"]);
  });

  it("trims the skill id and department id", () => {
    const entries = publishOk([], "  design-tokens  ", "  design  ");
    expect(entries[0]).toMatchObject({ skillId: "design-tokens", publishedBy: "design" });
  });

  it("is idempotent when the same department re-publishes its own skill", () => {
    const once = publishOk([], "design-tokens", "design");
    const twice = publishOk(once, "design-tokens", "design", LATER);
    expect(twice).toBe(once);
    expect(twice).toHaveLength(1);
  });

  it("refuses a skill already published by a different department", () => {
    const once = publishOk([], "design-tokens", "design");
    const r = publishSkill(once, "design-tokens", "growth");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("already published by");
  });

  it("requires a skill id and a publishing department", () => {
    expect(publishSkill([], "", "design").ok).toBe(false);
    expect(publishSkill([], "x", "").ok).toBe(false);
  });
});

describe("adoptSkill", () => {
  it("adds the adopting department to the entry adopters", () => {
    const published = publishOk([], "design-tokens", "design");
    const adopted = adoptOk(published, "design-tokens", "growth", LATER);
    expect(getEntry(adopted, "design-tokens")?.adopters).toEqual(["growth"]);
    expect(getEntry(adopted, "design-tokens")?.updatedAt).toBe(LATER.toISOString());
  });

  it("is idempotent — re-adopting the same skill is a no-op", () => {
    const published = publishOk([], "design-tokens", "design");
    const once = adoptOk(published, "design-tokens", "growth");
    const twice = adoptOk(once, "design-tokens", "growth", LATER);
    expect(twice).toBe(once);
    expect(getEntry(twice, "design-tokens")?.adopters).toEqual(["growth"]);
  });

  it("allows multiple distinct departments to adopt", () => {
    let entries = publishOk([], "design-tokens", "design");
    entries = adoptOk(entries, "design-tokens", "growth");
    entries = adoptOk(entries, "design-tokens", "ops");
    expect(getEntry(entries, "design-tokens")?.adopters).toEqual(["growth", "ops"]);
  });

  it("refuses to adopt a skill that was never published", () => {
    const r = adoptSkill([], "ghost-skill", "growth");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not published");
  });

  it("requires a skill id and an adopting department", () => {
    const published = publishOk([], "design-tokens", "design");
    expect(adoptSkill(published, "", "growth").ok).toBe(false);
    expect(adoptSkill(published, "design-tokens", "").ok).toBe(false);
  });
});

describe("skillsForDepartment (scoping resolver)", () => {
  it("returns a department's own skills plus its adopted exchange skills", () => {
    let entries = publishOk([], "design-tokens", "design");
    entries = adoptOk(entries, "design-tokens", "growth");
    const resolved = skillsForDepartment("growth", entries, ["growth-playbook"]);
    expect(resolved).toEqual(["design-tokens", "growth-playbook"]);
  });

  it("EXCLUDES a published-but-not-adopted skill for a non-adopting department", () => {
    // done-criterion: A publishes, only B adopts → only B loads it (scoped, not global).
    let entries = publishOk([], "design-tokens", "design");
    entries = adoptOk(entries, "design-tokens", "growth");
    // ops never adopted → must not see design-tokens
    expect(skillsForDepartment("ops", entries, ["ops-runbook"])).toEqual(["ops-runbook"]);
    // growth adopted → sees it
    expect(skillsForDepartment("growth", entries, [])).toEqual(["design-tokens"]);
  });

  it("the publisher loads its own publication without re-adopting", () => {
    const entries = publishOk([], "design-tokens", "design");
    expect(skillsForDepartment("design", entries, ["brand-book"])).toEqual(["brand-book", "design-tokens"]);
  });

  it("dedupes when an own skill and an adopted skill collide", () => {
    let entries = publishOk([], "shared", "design");
    entries = adoptOk(entries, "shared", "growth");
    expect(skillsForDepartment("growth", entries, ["shared", "shared"])).toEqual(["shared"]);
  });

  it("returns just the own skills when the exchange is empty", () => {
    expect(skillsForDepartment("growth", [], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("listEntriesSorted", () => {
  it("sorts entries by skill id without mutating the input", () => {
    let entries = publishOk([], "zeta", "design");
    entries = publishOk(entries, "alpha", "design");
    const sorted = listEntriesSorted(entries);
    expect(sorted.map((e) => e.skillId)).toEqual(["alpha", "zeta"]);
    expect(entries.map((e) => e.skillId)).toEqual(["zeta", "alpha"]);
  });
});

describe("store (injected fs)", () => {
  function fakeFs(initial?: string): { fs: ExchangeStoreFs; files: Map<string, string> } {
    const files = new Map<string, string>();
    const key = (path: string) => (path.endsWith("skill-exchange.json") ? "EXCHANGE" : path);
    if (initial !== undefined) files.set("EXCHANGE", initial);
    const fs: ExchangeStoreFs = {
      readFile: async (path) => {
        if (!files.has(key(path))) throw new Error("ENOENT");
        return files.get(key(path))!;
      },
      writeFile: async (path, data) => {
        files.set(key(path), data);
      },
      mkdir: async () => {},
    };
    return { fs, files };
  }

  const env = { VANTA_HOME: "/tmp/vanta-test-home" } as unknown as NodeJS.ProcessEnv;

  it("round-trips entries through the store", async () => {
    const { fs } = fakeFs();
    let entries = publishOk([], "design-tokens", "design");
    entries = adoptOk(entries, "design-tokens", "growth");
    await writeExchange(entries, env, fs);
    const read = await readExchange(env, fs);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ skillId: "design-tokens", publishedBy: "design", adopters: ["growth"] });
  });

  it("returns [] when the file is missing (tolerant)", async () => {
    const { fs } = fakeFs();
    expect(await readExchange(env, fs)).toEqual([]);
  });

  it("returns [] when the file is corrupt JSON (tolerant)", async () => {
    const { fs } = fakeFs("{ not json");
    expect(await readExchange(env, fs)).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones (tolerant)", async () => {
    const valid = publishOk([], "design-tokens", "design");
    const raw = JSON.stringify({
      version: 1,
      entries: [valid[0], { skillId: "broken" /* missing required fields */ }, 42],
    });
    const { fs } = fakeFs(raw);
    const read = await readExchange(env, fs);
    expect(read.map((e) => e.skillId)).toEqual(["design-tokens"]);
  });
});
