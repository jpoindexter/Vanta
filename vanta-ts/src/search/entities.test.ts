import { describe, it, expect } from "vitest";
import { extractEntities, buildEntityIndex, entityWeight, entityRank } from "./entities.js";

describe("extractEntities", () => {
  it("extracts proper-noun spans plus their individual words, lowercased", () => {
    const ents = extractEntities("I met Caroline Smith in San Francisco.");
    expect(ents).toContain("caroline smith");
    expect(ents).toContain("caroline");
    expect(ents).toContain("smith");
    expect(ents).toContain("san francisco");
    expect(ents).toContain("san");
  });

  it("drops capitalized sentence machinery (The, She, Monday…)", () => {
    const ents = extractEntities("The party was fun. She saw Melanie on Monday.");
    expect(ents).toEqual(["melanie"]);
  });

  it("extracts emails and @handles", () => {
    const ents = extractEntities("mail jane@corp.io or ping @jane_dev");
    expect(ents).toContain("jane@corp.io");
    expect(ents).toContain("@jane_dev");
  });

  it("strips punctuation around names and dedupes", () => {
    expect(extractEntities("(Boston), Boston!")).toEqual(["boston"]);
  });

  it("returns empty for entity-free text", () => {
    expect(extractEntities("the cat sat on the mat")).toEqual([]);
  });
});

describe("entityWeight", () => {
  it("gives full weight to a unique entity and decays over-linked ones", () => {
    expect(entityWeight(1)).toBe(1);
    expect(entityWeight(11)).toBeCloseTo(1 / 1.1, 10); // 1/(1+0.001·100)
    expect(entityWeight(101)).toBeCloseTo(1 / 11, 10); // 1/(1+0.001·10000)
    expect(entityWeight(2)).toBeGreaterThan(entityWeight(50));
  });
});

describe("buildEntityIndex / entityRank", () => {
  const records = [
    { id: "a", text: "Caroline adopted a dog in Boston" },
    { id: "b", text: "Melanie paints landscapes" },
    { id: "c", text: "Caroline and Melanie visited Boston together" },
    { id: "d", text: "nothing capitalized here" },
  ];
  const index = buildEntityIndex(records);

  it("links an entity across the records that mention it", () => {
    expect([...(index.byEntity.get("caroline") ?? [])]).toEqual(["a", "c"]);
    expect([...(index.byEntity.get("melanie") ?? [])]).toEqual(["b", "c"]);
    expect(index.byRecord.get("d")?.size).toBe(0);
  });

  it("ranks records sharing more (and rarer) query entities first", () => {
    // "c" shares caroline+melanie+boston; "a" shares caroline+boston; "b" melanie.
    expect(entityRank("Did Caroline or Melanie go to Boston?", index)).toEqual(["c", "a", "b"]);
  });

  it("returns empty when the query has no matching entities (signal stays silent)", () => {
    expect(entityRank("what happened yesterday", index)).toEqual([]);
    expect(entityRank("Zurich trip", index)).toEqual([]);
  });

  it("breaks score ties by record input order (stable)", () => {
    const idx = buildEntityIndex([
      { id: "y", text: "Paris in spring" },
      { id: "x", text: "Paris in autumn" },
    ]);
    expect(entityRank("Paris", idx)).toEqual(["y", "x"]);
  });
});
