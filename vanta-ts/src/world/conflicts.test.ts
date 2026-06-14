import { describe, it, expect } from "vitest";
import { findConflicts, recallWithSources } from "./conflicts.js";
import type { WorldRelation, WorldEntity } from "./store.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function rel(from: string, relLabel: string, to: string, ts = "t1"): WorldRelation {
  return { kind: "relation", from, rel: relLabel, to, ts };
}

function ent(id: string, type: string, name: string, note?: string, ts = "t1"): WorldEntity {
  return { kind: "entity", id, type, name, note, ts };
}

// ---------------------------------------------------------------------------
// findConflicts
// ---------------------------------------------------------------------------

describe("findConflicts", () => {
  it("detects a contradiction (same from+rel, different to)", () => {
    const rels: WorldRelation[] = [
      rel("jason", "owns", "indx", "t1"),
      rel("jason", "owns", "brutal", "t2"),
    ];
    const cs = findConflicts(rels);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.subject).toBe("jason");
    expect(cs[0]!.predicate).toBe("owns");
    expect(cs[0]!.objects).toEqual(expect.arrayContaining(["indx", "brutal"]));
    expect(cs[0]!.recordIds).toHaveLength(2);
  });

  it("ignores consistent relations (same from+rel, same to)", () => {
    const rels: WorldRelation[] = [
      rel("jason", "owns", "indx", "t1"),
      rel("jason", "owns", "indx", "t2"),
    ];
    expect(findConflicts(rels)).toHaveLength(0);
  });

  it("returns empty for an empty relation list", () => {
    expect(findConflicts([])).toHaveLength(0);
  });

  it("detects multiple independent conflicts", () => {
    const rels: WorldRelation[] = [
      rel("jason", "owns", "indx", "t1"),
      rel("jason", "owns", "brutal", "t2"),
      rel("vanta", "depends-on", "node", "t3"),
      rel("vanta", "depends-on", "rust", "t4"),
    ];
    const cs = findConflicts(rels);
    expect(cs).toHaveLength(2);
  });

  it("treats three distinct `to` values as one conflict with all objects", () => {
    const rels: WorldRelation[] = [
      rel("jason", "leads", "a", "t1"),
      rel("jason", "leads", "b", "t2"),
      rel("jason", "leads", "c", "t3"),
    ];
    const cs = findConflicts(rels);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.objects).toHaveLength(3);
  });

  it("does not cross-contaminate different predicates", () => {
    const rels: WorldRelation[] = [
      rel("jason", "owns", "indx", "t1"),
      rel("jason", "blocked-by", "indx", "t2"),
    ];
    expect(findConflicts(rels)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// recallWithSources
// ---------------------------------------------------------------------------

describe("recallWithSources", () => {
  const entities: WorldEntity[] = [
    ent("jason", "person", "Jason Poindexter", "founder", "2024-01-01T00:00:00Z"),
    ent("indx", "project", "Indx", "AI second brain", "2024-01-02T00:00:00Z"),
    ent("vanta", "repo", "Vanta", undefined, "2024-01-03T00:00:00Z"),
  ];
  const rels: WorldRelation[] = [
    rel("jason", "owns", "indx", "2024-01-04T00:00:00Z"),
    rel("indx", "depends-on", "vanta", "2024-01-05T00:00:00Z"),
  ];

  it("returns entity matches with source citations", () => {
    const hits = recallWithSources(entities, rels, "founder");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe("entity");
    expect(hits[0]!.id).toBe("jason");
    expect(hits[0]!.ts).toBe("2024-01-01T00:00:00Z");
    expect(hits[0]!.text).toContain("founder");
  });

  it("returns relation matches with source citations", () => {
    const hits = recallWithSources(entities, rels, "depends-on");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe("relation");
    expect(hits[0]!.ts).toBe("2024-01-05T00:00:00Z");
    expect(hits[0]!.text).toContain("depends-on");
  });

  it("matches across both entities and relations for a broad query", () => {
    const hits = recallWithSources(entities, rels, "indx");
    // entity 'indx' + relation 'jason→owns→indx' + relation 'indx→depends-on→vanta'
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for an empty query", () => {
    expect(recallWithSources(entities, rels, "")).toHaveLength(0);
    expect(recallWithSources(entities, rels, "   ")).toHaveLength(0);
  });

  it("returns empty when nothing matches", () => {
    expect(recallWithSources(entities, rels, "xyzzy")).toHaveLength(0);
  });

  it("multi-token query requires ALL tokens to match", () => {
    // "jason owns" should hit the relation row but not the entity row (entity text has no "owns")
    const hits = recallWithSources(entities, rels, "jason owns");
    expect(hits.every((h) => h.text.toLowerCase().includes("owns"))).toBe(true);
  });
});
