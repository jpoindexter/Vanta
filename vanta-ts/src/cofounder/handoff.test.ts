import { describe, it, expect } from "vitest";
import {
  contextForDepartment,
  deriveHandoffId,
  getHandoff,
  listHandoffs,
  readHandoffs,
  recordHandoff,
  writeHandoffs,
  type GetArtifact,
  type HandoffEdge,
  type HandoffStoreFs,
  type ResolvedArtifact,
} from "./handoff.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

/** Seed one valid hand-off edge (throws on the never-taken error path). */
function seed(
  workProductId = "growth-wp-1",
  fromDept = "growth",
  toDept = "brand",
  existing: HandoffEdge[] = [],
  now: Date = NOW,
): HandoffEdge {
  const r = recordHandoff(existing, { workProductId, fromDept, toDept }, now);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("recordHandoff", () => {
  it("creates a hand-off edge binding an artifact from one department to another", () => {
    const r = recordHandoff([], { workProductId: "growth-wp-1", fromDept: "growth", toDept: "brand" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("handoff-1");
    expect(r.value.workProductId).toBe("growth-wp-1");
    expect(r.value.fromDepartment).toBe("growth");
    expect(r.value.toDepartment).toBe("brand");
    expect(r.value.createdAt).toBe(NOW.toISOString());
  });

  it("trims whitespace on all fields", () => {
    const r = recordHandoff([], { workProductId: "  growth-wp-1 ", fromDept: " growth ", toDept: " brand " }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.workProductId).toBe("growth-wp-1");
    expect(r.value.fromDepartment).toBe("growth");
    expect(r.value.toDepartment).toBe("brand");
  });

  it("requires a workProductId", () => {
    const r = recordHandoff([], { workProductId: "  ", fromDept: "growth", toDept: "brand" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/workProductId is required/);
  });

  it("requires a fromDepartment", () => {
    const r = recordHandoff([], { workProductId: "wp", fromDept: "", toDept: "brand" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fromDepartment is required/);
  });

  it("requires a toDepartment", () => {
    const r = recordHandoff([], { workProductId: "wp", fromDept: "growth", toDept: " " }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/toDepartment is required/);
  });

  it("refuses a department handing off to itself", () => {
    const r = recordHandoff([], { workProductId: "wp", fromDept: "growth", toDept: "growth" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/cannot hand off to itself/);
  });

  it("derives a unique id as edges accumulate", () => {
    const first = seed();
    const second = seed("growth-wp-2", "growth", "ops", [first]);
    expect(second.id).toBe("handoff-2");
    expect(deriveHandoffId([first, second])).toBe("handoff-3");
  });
});

describe("contextForDepartment", () => {
  // An artifact resolver over a fixed library: id → content + approval state.
  function resolver(library: Record<string, ResolvedArtifact>): GetArtifact {
    return (id) => library[id] ?? null;
  }

  it("injects an approved upstream artifact for the target department", () => {
    const edge = seed("growth-wp-1", "growth", "brand");
    const get = resolver({ "growth-wp-1": { content: "Q3 GTM plan", approved: true } });

    const ctx = contextForDepartment("brand", [edge], get);

    expect(ctx).toHaveLength(1);
    expect(ctx[0]).toEqual({
      workProductId: "growth-wp-1",
      fromDepartment: "growth",
      content: "Q3 GTM plan",
    });
  });

  it("EXCLUDES an unapproved (not-yet-locked) artifact — no context", () => {
    const edge = seed("growth-wp-1", "growth", "brand");
    const get = resolver({ "growth-wp-1": { content: "draft plan", approved: false } });

    expect(contextForDepartment("brand", [edge], get)).toEqual([]);
  });

  it("EXCLUDES a missing (deleted/never-existed) artifact — no context", () => {
    const edge = seed("gone-wp-9", "growth", "brand");
    const get = resolver({}); // resolves to null

    expect(contextForDepartment("brand", [edge], get)).toEqual([]);
  });

  it("only follows edges that target the asked-for department", () => {
    const toBrand = seed("growth-wp-1", "growth", "brand");
    const toOps = seed("growth-wp-2", "growth", "ops", [toBrand]);
    const get = resolver({
      "growth-wp-1": { content: "for brand", approved: true },
      "growth-wp-2": { content: "for ops", approved: true },
    });

    expect(contextForDepartment("brand", [toBrand, toOps], get).map((c) => c.content)).toEqual(["for brand"]);
    expect(contextForDepartment("ops", [toBrand, toOps], get).map((c) => c.content)).toEqual(["for ops"]);
  });

  it("aggregates every approved inbound artifact, preserving edge order", () => {
    const e1 = seed("growth-wp-1", "growth", "brand");
    const e2 = seed("sales-wp-1", "sales", "brand", [e1]);
    const get = resolver({
      "growth-wp-1": { content: "gtm", approved: true },
      "sales-wp-1": { content: "pipeline", approved: true },
    });

    expect(contextForDepartment("brand", [e1, e2], get).map((c) => c.content)).toEqual(["gtm", "pipeline"]);
  });

  it("matches the target department after trimming", () => {
    const edge = seed("growth-wp-1", "growth", "brand");
    const get = resolver({ "growth-wp-1": { content: "x", approved: true } });
    expect(contextForDepartment("  brand ", [edge], get)).toHaveLength(1);
  });

  it("returns [] for a department with no inbound edges", () => {
    const edge = seed("growth-wp-1", "growth", "brand");
    const get = resolver({ "growth-wp-1": { content: "x", approved: true } });
    expect(contextForDepartment("legal", [edge], get)).toEqual([]);
  });

  it("mixes approved + unapproved + missing — only approved survive", () => {
    const ok = seed("growth-wp-1", "growth", "brand");
    const pending = seed("growth-wp-2", "growth", "brand", [ok]);
    const missing = seed("growth-wp-3", "growth", "brand", [ok, pending]);
    const get = resolver({
      "growth-wp-1": { content: "approved", approved: true },
      "growth-wp-2": { content: "pending", approved: false },
      // growth-wp-3 absent
    });

    expect(contextForDepartment("brand", [ok, pending, missing], get).map((c) => c.content)).toEqual(["approved"]);
  });
});

describe("getHandoff / listHandoffs", () => {
  it("finds an edge by id", () => {
    const e = seed();
    expect(getHandoff([e], e.id)).toBe(e);
    expect(getHandoff([e], "nope")).toBeUndefined();
  });

  it("orders newest-first by createdAt (id tie-break)", () => {
    const older = seed("growth-wp-1", "growth", "brand", [], new Date("2026-06-20T00:00:00.000Z"));
    const newer = seed("growth-wp-2", "growth", "ops", [older], new Date("2026-06-21T00:00:00.000Z"));
    expect(listHandoffs([older, newer]).map((e) => e.id)).toEqual([newer.id, older.id]);
  });
});

describe("store (injected fs)", () => {
  function fakeFs(initial?: string): { fs: HandoffStoreFs; files: Map<string, string> } {
    const files = new Map<string, string>();
    if (initial !== undefined) files.set("HO", initial);
    const fs: HandoffStoreFs = {
      readFile: async (path) => {
        const key = path.endsWith("handoffs.json") ? "HO" : path;
        if (!files.has(key)) throw new Error("ENOENT");
        return files.get(key)!;
      },
      writeFile: async (path, data) => {
        files.set(path.endsWith("handoffs.json") ? "HO" : path, data);
      },
      mkdir: async () => {},
    };
    return { fs, files };
  }

  const env = { VANTA_HOME: "/tmp/vanta-test-home" } as unknown as NodeJS.ProcessEnv;

  it("round-trips hand-off edges through the store", async () => {
    const { fs } = fakeFs();
    await writeHandoffs([seed()], env, fs);
    const read = await readHandoffs(env, fs);
    expect(read).toHaveLength(1);
    expect(read[0]?.id).toBe("handoff-1");
    expect(read[0]?.workProductId).toBe("growth-wp-1");
    expect(read[0]?.toDepartment).toBe("brand");
  });

  it("returns [] when the file is missing (tolerant)", async () => {
    const { fs } = fakeFs();
    expect(await readHandoffs(env, fs)).toEqual([]);
  });

  it("returns [] when the file is corrupt JSON (tolerant)", async () => {
    const { fs } = fakeFs("{ not json");
    expect(await readHandoffs(env, fs)).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones (tolerant)", async () => {
    const raw = JSON.stringify({
      version: 1,
      handoffs: [seed(), { id: "broken" /* missing required fields */ }, 42],
    });
    const { fs } = fakeFs(raw);
    const read = await readHandoffs(env, fs);
    expect(read.map((e) => e.id)).toEqual(["handoff-1"]);
  });
});
