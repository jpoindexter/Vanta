import { describe, it, expect } from "vitest";
import { makeEntity, makeRelation, appendGraph, graphQuery } from "./store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("graph/store", () => {
  it("makeEntity creates a deterministic ID", () => {
    const e1 = makeEntity("vanta", "project");
    const e2 = makeEntity("VANTA", "project");
    // Case-normalized → same ID
    expect(e1.id).toBe(e2.id);
    expect(e1.kind).toBe("entity");
  });

  it("makeRelation creates a relation record", () => {
    const proj = makeEntity("vanta", "project");
    const tool = makeEntity("vitest", "tool");
    const rel = makeRelation(proj, tool, "uses");
    expect(rel.kind).toBe("relation");
    expect(rel.from).toBe(proj.id);
    expect(rel.to).toBe(tool.id);
    expect(rel.rel).toBe("uses");
  });

  it("appendGraph + graphQuery round-trip", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vanta-test-graph-"));
    try {
      const env = { VANTA_HOME: dir };
      const proj = makeEntity("my-project", "project");
      const tool = makeEntity("vitest-xyz", "tool");
      const rel = makeRelation(proj, tool, "uses", 0.9);
      await appendGraph([proj, tool, rel], env);

      const results = await graphQuery("my-project", { env });
      expect(results.length).toBe(1);
      expect(results[0]?.entity.name).toBe("my-project");
      expect(results[0]?.relations.length).toBe(1);
      expect(results[0]?.relations[0]?.rel).toBe("uses");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty array when graph file is absent", async () => {
    const results = await graphQuery("anything", { env: { VANTA_HOME: "/tmp/no-graph-dir-xyz" } });
    expect(results).toEqual([]);
  });
});
