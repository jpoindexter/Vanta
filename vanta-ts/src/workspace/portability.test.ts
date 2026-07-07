import { describe, it, expect } from "vitest";
import { parseBundle, scrubBundle, mergeCollection, type WorkspaceBundle, type WorkspaceRecord } from "./portability.js";

// PCLIP-WORKSPACE-PORTABILITY — scrubbed bundle + id-collision merge.

const bundle = (collections: Record<string, WorkspaceRecord[]>): WorkspaceBundle => ({ version: 1, exportedAt: "2026-07-07T00:00:00Z", collections });

describe("parseBundle", () => {
  it("accepts a valid bundle and drops records without a string id", () => {
    const b = parseBundle({ version: 1, exportedAt: "t", collections: { skills: [{ id: "a" }, { nope: 1 }] } });
    expect(b?.collections.skills).toEqual([{ id: "a" }]);
  });
  it("rejects wrong version / junk", () => {
    expect(parseBundle({ version: 2, exportedAt: "t", collections: {} })).toBeNull();
    expect(parseBundle("nope")).toBeNull();
  });
});

describe("scrubBundle", () => {
  it("masks secrets in string fields, recursing into nested objects (never mutates input)", () => {
    const input = bundle({ routines: [{ id: "r1", cron: "0 9 * * *", cmd: "curl https://api.co?token=sk-supersecret123", meta: { note: "authorization: Bearer abcdef123456" } }] });
    const out = scrubBundle(input);
    const rec = out.collections.routines![0]!;
    expect(JSON.stringify(rec)).not.toContain("sk-supersecret123");
    expect(JSON.stringify((rec.meta as { note: string }).note)).not.toContain("abcdef123456");
    // Non-secret fields survive; input untouched.
    expect(rec.cron).toBe("0 9 * * *");
    expect(JSON.stringify(input)).toContain("sk-supersecret123");
  });
});

describe("mergeCollection — id collision handling", () => {
  const existing: WorkspaceRecord[] = [{ id: "a", v: 1 }, { id: "b", v: 1 }];

  it("adds non-colliding records", () => {
    const r = mergeCollection(existing, [{ id: "c", v: 9 }], "skip");
    expect(r.added).toBe(1);
    expect(r.merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("skip: keeps existing, drops the colliding incoming", () => {
    const r = mergeCollection(existing, [{ id: "a", v: 2 }], "skip");
    expect(r).toMatchObject({ skipped: 1, added: 0 });
    expect(r.merged.find((x) => x.id === "a")?.v).toBe(1); // existing kept
  });

  it("overwrite: incoming wins, order preserved", () => {
    const r = mergeCollection(existing, [{ id: "a", v: 2 }], "overwrite");
    expect(r.overwritten).toBe(1);
    expect(r.merged.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.merged.find((x) => x.id === "a")?.v).toBe(2);
  });

  it("rename: incoming gets a fresh -imported id and is added alongside", () => {
    const r = mergeCollection(existing, [{ id: "a", v: 2 }], "rename");
    expect(r.renamed).toBe(1);
    expect(r.merged.map((x) => x.id)).toEqual(["a", "b", "a-imported"]);
    expect(r.merged.find((x) => x.id === "a")?.v).toBe(1); // original untouched
  });

  it("rename bumps the suffix when -imported also exists", () => {
    const r = mergeCollection([{ id: "a" }, { id: "a-imported" }], [{ id: "a" }], "rename");
    expect(r.merged.map((x) => x.id)).toContain("a-imported-2");
  });
});
