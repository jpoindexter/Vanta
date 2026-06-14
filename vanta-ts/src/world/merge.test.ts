import { describe, it, expect } from "vitest";
import { mergeEntities, mergeRecords, findDuplicates } from "./merge.js";
import type { WorldEntity, WorldRecord } from "./store.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const e = (id: string, type: string, name: string): WorldEntity => ({
  kind: "entity",
  id,
  type,
  name,
  ts: "2024-01-01T00:00:00.000Z",
});

const r = (from: string, to: string, rel: string): WorldRecord => ({
  kind: "relation",
  from,
  to,
  rel,
  ts: "2024-01-01T00:00:00.000Z",
});

// ---------------------------------------------------------------------------
// mergeEntities
// ---------------------------------------------------------------------------

describe("mergeEntities", () => {
  it("returns an alias tombstone for dropId", () => {
    const records: WorldRecord[] = [e("alice", "person", "Alice")];
    const { alias } = mergeEntities(records, "alice", "al");
    expect(alias.id).toBe("al");
    expect(alias.type).toBe("alias");
    expect(alias.name).toBe("→ alice");
    expect(alias.note).toContain("alice");
  });

  it("re-points a relation where dropId is the subject", () => {
    const records: WorldRecord[] = [
      e("alice", "person", "Alice"),
      e("al", "person", "Al"),
      r("al", "acme", "works-at"),
    ];
    const { repointed } = mergeEntities(records, "alice", "al");
    expect(repointed).toHaveLength(1);
    expect(repointed[0]?.from).toBe("alice");
    expect(repointed[0]?.to).toBe("acme");
    expect(repointed[0]?.rel).toBe("works-at");
  });

  it("re-points a relation where dropId is the object", () => {
    const records: WorldRecord[] = [
      e("alice", "person", "Alice"),
      e("al", "person", "Al"),
      r("acme", "al", "employs"),
    ];
    const { repointed } = mergeEntities(records, "alice", "al");
    expect(repointed).toHaveLength(1);
    expect(repointed[0]?.from).toBe("acme");
    expect(repointed[0]?.to).toBe("alice");
  });

  it("re-points a self-loop (from=dropId AND to=dropId)", () => {
    const records: WorldRecord[] = [r("al", "al", "self-ref")];
    const { repointed } = mergeEntities(records, "alice", "al");
    expect(repointed[0]?.from).toBe("alice");
    expect(repointed[0]?.to).toBe("alice");
  });

  it("ignores relations that do not touch dropId", () => {
    const records: WorldRecord[] = [r("bob", "acme", "works-at")];
    const { repointed } = mergeEntities(records, "alice", "al");
    expect(repointed).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const rel = r("al", "acme", "works-at");
    const records: WorldRecord[] = [rel];
    mergeEntities(records, "alice", "al");
    expect(records).toHaveLength(1);
    expect(records[0]).toBe(rel); // same reference
  });

  it("mergeRecords returns alias first, then repointed", () => {
    const records: WorldRecord[] = [r("al", "acme", "works-at")];
    const result = mergeEntities(records, "alice", "al");
    const flat = mergeRecords(result);
    expect(flat[0]).toBe(result.alias);
    expect(flat[1]).toBe(result.repointed[0]);
  });
});

// ---------------------------------------------------------------------------
// findDuplicates
// ---------------------------------------------------------------------------

describe("findDuplicates", () => {
  it("flags entities of the same type with the same name (case-insensitive)", () => {
    const ents: WorldEntity[] = [
      e("alice-1", "person", "Alice"),
      e("alice-2", "person", "alice"),
    ];
    const pairs = findDuplicates(ents);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual(["alice-1", "alice-2"]);
  });

  it("ignores different types even with the same name", () => {
    const ents: WorldEntity[] = [
      e("acme-p", "project", "Acme"),
      e("acme-c", "company", "Acme"),
    ];
    const pairs = findDuplicates(ents);
    expect(pairs).toHaveLength(0);
  });

  it("ignores alias tombstones", () => {
    const ents: WorldEntity[] = [
      e("alice", "person", "Alice"),
      { ...e("al", "alias", "→ alice"), type: "alias" },
    ];
    const pairs = findDuplicates(ents);
    expect(pairs).toHaveLength(0);
  });

  it("first-seen id becomes the keeper", () => {
    const ents: WorldEntity[] = [
      e("bob-old", "person", "Bob"),
      e("bob-new", "person", "  Bob  "),
    ];
    const pairs = findDuplicates(ents);
    const [keepId, dropId] = pairs[0]!;
    expect(keepId).toBe("bob-old");
    expect(dropId).toBe("bob-new");
  });

  it("returns empty for a clean entity list", () => {
    const ents: WorldEntity[] = [
      e("alice", "person", "Alice"),
      e("bob", "person", "Bob"),
    ];
    expect(findDuplicates(ents)).toHaveLength(0);
  });

  it("handles an empty list", () => {
    expect(findDuplicates([])).toHaveLength(0);
  });
});
