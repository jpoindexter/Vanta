import { describe, it, expect } from "vitest";
import { traverse, bridgeRecall, formatPath, DEFAULT_MAX_DEPTH } from "./graph-bridge.js";
import { recallWithSources } from "../world/conflicts.js";
import { recallAtK } from "../mem-eval/grade.js";
import type { WorldEntity, WorldRelation } from "../world/store.js";

const ent = (id: string, name: string): WorldEntity => ({ kind: "entity", id, type: "person", name, ts: "2024-01-01" });
const rel = (from: string, r: string, to: string): WorldRelation => ({ kind: "relation", from, rel: r, to, ts: "2024-01-01" });

const entities = [ent("a", "Alice"), ent("b", "Bob"), ent("c", "Carol")];
const rels = [rel("a", "manages", "b"), rel("b", "mentors", "c")];

describe("traverse", () => {
  it("follows typed relations up to maxDepth hops with the path", () => {
    const chains = traverse("a", rels, 3);
    const carol = chains.find((c) => c.target === "c");
    expect(carol?.path.map((s) => s.rel)).toEqual(["manages", "mentors"]); // 2-hop path
  });

  it("bounds the hop depth", () => {
    expect(traverse("a", rels, 1).some((c) => c.target === "c")).toBe(false); // c is 2 hops away
    expect(traverse("a", rels, 1).some((c) => c.target === "b")).toBe(true);
  });

  it("prunes cycles", () => {
    const cyclic = [rel("a", "x", "b"), rel("b", "y", "a")];
    expect(() => traverse("a", cyclic, 10)).not.toThrow();
    expect(traverse("a", cyclic, 10).length).toBeLessThanOrEqual(2);
  });
});

describe("bridgeRecall", () => {
  it("surfaces a multi-hop related entity with the relation path as provenance", () => {
    const hits = bridgeRecall("Alice", entities, rels, DEFAULT_MAX_DEPTH);
    const carol = hits.find((h) => h.target.id === "c");
    expect(carol).toBeTruthy();
    expect(carol?.provenance).toBe("Alice —manages→ Bob —mentors→ Carol");
  });

  it("is a no-op when the world is empty", () => {
    expect(bridgeRecall("Alice", [], [], 3)).toEqual([]);
    expect(bridgeRecall("Alice", entities, [], 3)).toEqual([]);
  });
});

describe("formatPath", () => {
  it("renders ids as names along the chain", () => {
    const nameOf = (id: string) => ({ a: "Alice", b: "Bob" }[id] ?? id);
    expect(formatPath([{ from: "a", rel: "knows", to: "b" }], nameOf)).toBe("Alice —knows→ Bob");
  });
});

// The card's eval guarantee: the relationship/multi-hop category improves vs a
// non-traversal baseline. Direct keyword recall can't reach a 2-hop entity; the bridge can.
describe("relationship category improves vs baseline (eval grader)", () => {
  it("traversal recovers the 2-hop target that direct recall misses", () => {
    const query = "what is Alice connected to";
    const gold = ["c"]; // Carol, two hops from Alice
    const baselineIds = recallWithSources(entities, rels, query).map((m) => m.id);
    const bridgeIds = bridgeRecall(query, entities, rels).map((h) => h.target.id);
    const baseline = recallAtK(baselineIds, gold, 5);
    const bridged = recallAtK(bridgeIds, gold, 5);
    expect(baseline).toBe(0); // direct recall never reaches Carol
    expect(bridged).toBe(1); // the bridge does
    expect(bridged).toBeGreaterThan(baseline);
  });
});
