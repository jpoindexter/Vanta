import { describe, it, expect } from "vitest";
import { routeOrder, routeRecall, formatRoutedHit, type StoreId, type StoreLookup } from "./router.js";

describe("routeOrder", () => {
  it("puts the live source first for a 'current/status' query", () => {
    expect(routeOrder("what is the current deal status")[0]).toBe("live");
  });
  it("puts the world model first for a relationship query", () => {
    expect(routeOrder("what is related to MegaCorp")[0]).toBe("world");
  });
  it("uses the default order (entries first) otherwise", () => {
    expect(routeOrder("what editor does Jason use")[0]).toBe("entries");
  });
});

const hit = (text: string): StoreLookup => async () => text;
const miss: StoreLookup = async () => null;

describe("routeRecall (graded fallback + provenance)", () => {
  it("returns the first sufficient hit with provenance and the trail tried", async () => {
    const r = await routeRecall("what editor does Jason use", { entries: miss, world: hit("world says X") });
    expect(r?.store).toBe("world");
    expect(r?.text).toBe("world says X");
    expect(r?.trail).toEqual(["entries", "world"]); // regions/life-search/vault/live had no lookup
  });

  it("skips stores with no lookup and falls through misses", async () => {
    const r = await routeRecall("anything", { entries: miss, "life-search": hit("found in life-search") });
    expect(r?.store).toBe("life-search");
  });

  it("falls through a lookup that throws", async () => {
    const boom: StoreLookup = async () => { throw new Error("store down"); };
    const r = await routeRecall("anything", { entries: boom, world: hit("ok") });
    expect(r?.store).toBe("world");
  });

  it("returns null when no store answers", async () => {
    expect(await routeRecall("anything", { entries: miss, world: miss })).toBeNull();
  });

  it("consults the live source first for a current-data query", async () => {
    const r = await routeRecall("current status", { entries: hit("stale entry"), live: hit("↪ live[Slack]: status") });
    expect(r?.store).toBe("live");
  });
});

// The card's eval guarantee: routing across stores has accuracy >= any single store.
describe("routed recall accuracy >= single-store baseline", () => {
  it("answers every query that ANY store can answer, beating each store alone", async () => {
    // each query is answerable by exactly one store
    const queries: { q: string; store: StoreId }[] = [
      { q: "entries fact", store: "entries" },
      { q: "world relation", store: "world" },
      { q: "life-search hit", store: "life-search" },
    ];
    const lookups: Partial<Record<StoreId, StoreLookup>> = {
      entries: async (q) => (q.includes("entries") ? "E" : null),
      world: async (q) => (q.includes("world") ? "W" : null),
      "life-search": async (q) => (q.includes("life-search") ? "L" : null),
    };
    const recall = async (lk: Partial<Record<StoreId, StoreLookup>>) => {
      let answered = 0;
      for (const { q } of queries) if (await routeRecall(q, lk)) answered++;
      return answered / queries.length;
    };
    const routed = await recall(lookups);
    const bestSingle = Math.max(
      await recall({ entries: lookups.entries }),
      await recall({ world: lookups.world }),
      await recall({ "life-search": lookups["life-search"] }),
    );
    expect(routed).toBe(1); // every query answered
    expect(routed).toBeGreaterThanOrEqual(bestSingle);
    expect(bestSingle).toBeLessThan(1); // no single store answers all → routing strictly helps
  });
});

describe("formatRoutedHit", () => {
  it("renders provenance and the trail", () => {
    const s = formatRoutedHit({ store: "world", text: "X", trail: ["entries", "world"] });
    expect(s).toContain("source: world");
    expect(s).toContain("entries → world");
  });
});
