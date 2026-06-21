import { describe, it, expect } from "vitest";
import {
  parsePluginDeps,
  resolveLoadOrder,
  missingDeps,
  detectCycle,
  type PluginNode,
} from "./dep-resolve.js";

const node = (name: string, dependsOn: string[] = []): PluginNode => ({ name, dependsOn });

describe("parsePluginDeps", () => {
  it("reads a dependsOn string array off the raw manifest", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: ["b", "c"] })).toEqual(["b", "c"]);
  });

  it("returns [] when dependsOn is absent", () => {
    expect(parsePluginDeps({ name: "a" })).toEqual([]);
  });

  it("returns [] for a non-array dependsOn (garbage tolerance)", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: "b" })).toEqual([]);
    expect(parsePluginDeps({ name: "a", dependsOn: 42 })).toEqual([]);
    expect(parsePluginDeps({ name: "a", dependsOn: { b: true } })).toEqual([]);
  });

  it("returns [] for a non-object / null / undefined manifest", () => {
    expect(parsePluginDeps(null)).toEqual([]);
    expect(parsePluginDeps(undefined)).toEqual([]);
    expect(parsePluginDeps("nope")).toEqual([]);
    expect(parsePluginDeps(7)).toEqual([]);
  });

  it("drops non-string and blank entries", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: ["b", 1, "", "  ", null, "c"] })).toEqual(["b", "c"]);
  });

  it("trims entries", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: ["  b  ", "c "] })).toEqual(["b", "c"]);
  });

  it("dedupes (first occurrence wins, order preserved)", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: ["b", "c", "b", "c"] })).toEqual(["b", "c"]);
  });

  it("drops self-references", () => {
    expect(parsePluginDeps({ name: "a", dependsOn: ["a", "b"] })).toEqual(["b"]);
    expect(parsePluginDeps({ name: " a ", dependsOn: ["a", "b"] })).toEqual(["b"]);
  });
});

describe("missingDeps", () => {
  it("reports a declared dep not present in the node set", () => {
    const nodes = [node("a", ["b"]), node("c")];
    expect(missingDeps(nodes)).toEqual([{ plugin: "a", missing: "b" }]);
  });

  it("reports nothing when every dep is present", () => {
    const nodes = [node("a", ["b"]), node("b")];
    expect(missingDeps(nodes)).toEqual([]);
  });

  it("reports every missing edge", () => {
    const nodes = [node("a", ["x", "y"]), node("b", ["z"])];
    expect(missingDeps(nodes)).toEqual([
      { plugin: "a", missing: "x" },
      { plugin: "a", missing: "y" },
      { plugin: "b", missing: "z" },
    ]);
  });
});

describe("detectCycle", () => {
  it("returns null for an acyclic graph", () => {
    expect(detectCycle([node("a", ["b"]), node("b", ["c"]), node("c")])).toBeNull();
  });

  it("detects a two-node cycle A->B->A", () => {
    const cycle = detectCycle([node("a", ["b"]), node("b", ["a"])]);
    expect(cycle).toEqual(["a", "b", "a"]);
  });

  it("detects a self-cycle A->A", () => {
    const cycle = detectCycle([node("a", ["a"])]);
    expect(cycle).toEqual(["a", "a"]);
  });

  it("detects a longer cycle A->B->C->A", () => {
    const cycle = detectCycle([node("a", ["b"]), node("b", ["c"]), node("c", ["a"])]);
    expect(cycle).toEqual(["a", "b", "c", "a"]);
  });

  it("ignores edges to absent deps (those are missingDeps' concern)", () => {
    expect(detectCycle([node("a", ["ghost"])])).toBeNull();
  });
});

describe("resolveLoadOrder", () => {
  it("preserves input order when there are no deps", () => {
    const r = resolveLoadOrder([node("a"), node("b"), node("c")]);
    expect(r).toEqual({ ok: true, order: ["a", "b", "c"] });
  });

  it("orders a chain deps-first: A->B->C yields C, B, A", () => {
    // a depends on b, b depends on c
    const r = resolveLoadOrder([node("a", ["b"]), node("b", ["c"]), node("c")]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toEqual(["c", "b", "a"]);
  });

  it("resolves a diamond (dep loads before both dependents, root last)", () => {
    // a depends on b and c; b and c both depend on d
    const r = resolveLoadOrder([
      node("a", ["b", "c"]),
      node("b", ["d"]),
      node("c", ["d"]),
      node("d"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const pos = (n: string) => r.order.indexOf(n);
      expect(r.order).toHaveLength(4);
      expect(pos("d")).toBeLessThan(pos("b"));
      expect(pos("d")).toBeLessThan(pos("c"));
      expect(pos("b")).toBeLessThan(pos("a"));
      expect(pos("c")).toBeLessThan(pos("a"));
      // d ready first, then b/c (input order), then a
      expect(r.order).toEqual(["d", "b", "c", "a"]);
    }
  });

  it("handles multiple independent roots (input order among the ready)", () => {
    // two disjoint chains: a->b, x->y
    const r = resolveLoadOrder([
      node("a", ["b"]),
      node("b"),
      node("x", ["y"]),
      node("y"),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const pos = (n: string) => r.order.indexOf(n);
      expect(pos("b")).toBeLessThan(pos("a"));
      expect(pos("y")).toBeLessThan(pos("x"));
      expect(r.order).toEqual(["b", "y", "a", "x"]);
    }
  });

  it("returns a missing error (kind+name) for a declared dep not present", () => {
    const r = resolveLoadOrder([node("a", ["b"])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("missing");
      expect(r.detail).toBe("b");
      expect(r.error).toContain("b");
      expect(r.error).toContain("a");
    }
  });

  it("returns a cycle error (kind+path) for A->B->A", () => {
    const r = resolveLoadOrder([node("a", ["b"]), node("b", ["a"])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("cycle");
      expect(r.detail).toBe("a -> b -> a");
      expect(r.error).toContain("a -> b -> a");
    }
  });

  it("returns a cycle error for a self-cycle A->A", () => {
    const r = resolveLoadOrder([node("a", ["a"])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("cycle");
      expect(r.detail).toBe("a -> a");
    }
  });

  it("checks missing before cycle (missing dep takes precedence)", () => {
    // a<->b cycle, but a also depends on a missing "ghost"
    const r = resolveLoadOrder([node("a", ["b", "ghost"]), node("b", ["a"])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("missing");
      expect(r.detail).toBe("ghost");
    }
  });

  it("never throws — a cycle is a returned value, not an exception", () => {
    expect(() => resolveLoadOrder([node("a", ["b"]), node("b", ["a"])])).not.toThrow();
    expect(() => resolveLoadOrder([node("a", ["nope"])])).not.toThrow();
  });

  it("handles an empty node set", () => {
    expect(resolveLoadOrder([])).toEqual({ ok: true, order: [] });
  });

  it("round-trips parsePluginDeps into a node for resolution", () => {
    const manifests = [
      { name: "a", dependsOn: ["b"] },
      { name: "b", dependsOn: ["c"] },
      { name: "c" },
    ];
    const nodes = manifests.map((m) => node(m.name, parsePluginDeps(m)));
    const r = resolveLoadOrder(nodes);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toEqual(["c", "b", "a"]);
  });
});
