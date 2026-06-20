import { describe, it, expect } from "vitest";
import {
  byApproval,
  byDepartment,
  deriveWorkProductId,
  getWorkProduct,
  listWorkProducts,
  readWorkProducts,
  recordWorkProduct,
  setApproved,
  writeWorkProducts,
  type WorkProduct,
  type WorkProductStoreFs,
} from "./work-products.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

/** Seed one valid work product (throws on the never-taken error path). */
function seed(
  spec?: Partial<Parameters<typeof recordWorkProduct>[1]>,
  existing: WorkProduct[] = [],
): WorkProduct {
  const r = recordWorkProduct(
    existing,
    {
      artifact: "Q3 GTM plan.md",
      sourceTaskId: "task-7",
      departmentId: "growth",
      producedBy: "scout",
      ...spec,
    },
    NOW,
  );
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("recordWorkProduct", () => {
  it("creates a provenance-tagged artifact from a completed task", () => {
    const r = recordWorkProduct(
      [],
      { artifact: "logo.svg", kind: "design", sourceTaskId: "task-12", departmentId: "brand", producedBy: "muse" },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("brand-wp-1");
    expect(r.value.artifact).toBe("logo.svg");
    expect(r.value.kind).toBe("design");
    expect(r.value.sourceTaskId).toBe("task-12");
    expect(r.value.departmentId).toBe("brand");
    expect(r.value.producedBy).toBe("muse");
    expect(r.value.approved).toBe(false); // pending until reviewed
    expect(r.value.createdAt).toBe(NOW.toISOString());
  });

  it("defaults kind to document and approved to false", () => {
    const p = seed();
    expect(p.kind).toBe("document");
    expect(p.approved).toBe(false);
  });

  it("can land already approved", () => {
    const p = seed({ approved: true });
    expect(p.approved).toBe(true);
  });

  it("requires an artifact", () => {
    const r = recordWorkProduct([], { artifact: "  ", sourceTaskId: "t", departmentId: "d", producedBy: "w" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/artifact is required/);
  });

  it("requires a sourceTaskId (provenance)", () => {
    const r = recordWorkProduct([], { artifact: "a", sourceTaskId: "", departmentId: "d", producedBy: "w" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/sourceTaskId is required/);
  });

  it("requires a departmentId (provenance)", () => {
    const r = recordWorkProduct([], { artifact: "a", sourceTaskId: "t", departmentId: " ", producedBy: "w" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/departmentId is required/);
  });

  it("requires a producedBy (provenance)", () => {
    const r = recordWorkProduct([], { artifact: "a", sourceTaskId: "t", departmentId: "d", producedBy: "" }, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/producedBy is required/);
  });

  it("derives a unique id per department when others exist", () => {
    const first = seed();
    const second = seed({}, [first]);
    expect(second.id).toBe("growth-wp-2");
    expect(deriveWorkProductId([first, second], "growth")).toBe("growth-wp-3");
    // A different department starts its own counter.
    expect(deriveWorkProductId([first, second], "brand")).toBe("brand-wp-1");
  });
});

describe("listWorkProducts", () => {
  it("orders newest-first by createdAt", () => {
    const older = seed({ artifact: "old" });
    const newer = recordWorkProduct([older], { artifact: "new", sourceTaskId: "t8", departmentId: "growth", producedBy: "scout" }, new Date("2026-06-21T00:00:00.000Z"));
    if (!newer.ok) throw new Error(newer.error);
    expect(listWorkProducts([older, newer.value]).map((p) => p.artifact)).toEqual(["new", "old"]);
  });
});

describe("byDepartment / byApproval filters", () => {
  const growthA = seed({ artifact: "g1" });
  const growthB = seed({ artifact: "g2", approved: true }, [growthA]);
  const brand = seed({ artifact: "b1", departmentId: "brand" }, [growthA, growthB]);
  const all = [growthA, growthB, brand];

  it("byDepartment returns only that department's artifacts", () => {
    expect(byDepartment(all, "growth").map((p) => p.artifact).sort()).toEqual(["g1", "g2"]);
    expect(byDepartment(all, "brand").map((p) => p.artifact)).toEqual(["b1"]);
    expect(byDepartment(all, "nope")).toEqual([]);
  });

  it("byApproval splits approved from pending", () => {
    expect(byApproval(all, true).map((p) => p.artifact)).toEqual(["g2"]);
    expect(byApproval(all, false).map((p) => p.artifact).sort()).toEqual(["b1", "g1"]);
  });

  it("composes department + approval filters", () => {
    const pendingGrowth = byApproval(byDepartment(all, "growth"), false);
    expect(pendingGrowth.map((p) => p.artifact)).toEqual(["g1"]);
  });
});

describe("setApproved", () => {
  it("flips a pending artifact to approved", () => {
    const p = seed();
    const r = setApproved([p], p.id, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getWorkProduct(r.value, p.id)?.approved).toBe(true);
  });

  it("flips an approved artifact back to pending", () => {
    const p = seed({ approved: true });
    const r = setApproved([p], p.id, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(getWorkProduct(r.value, p.id)?.approved).toBe(false);
  });

  it("is idempotent when the state already matches", () => {
    const p = seed();
    const list = [p];
    const r = setApproved(list, p.id, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(list); // same array reference — no rebuild
  });

  it("errors on an unknown id", () => {
    const r = setApproved([seed()], "nope", true);
    expect(r.ok).toBe(false);
  });
});

describe("store (injected fs)", () => {
  function fakeFs(initial?: string): { fs: WorkProductStoreFs; files: Map<string, string> } {
    const files = new Map<string, string>();
    if (initial !== undefined) files.set("WP", initial);
    const fs: WorkProductStoreFs = {
      readFile: async (path) => {
        const key = path.endsWith("work-products.json") ? "WP" : path;
        if (!files.has(key)) throw new Error("ENOENT");
        return files.get(key)!;
      },
      writeFile: async (path, data) => {
        files.set(path.endsWith("work-products.json") ? "WP" : path, data);
      },
      mkdir: async () => {},
    };
    return { fs, files };
  }

  const env = { VANTA_HOME: "/tmp/vanta-test-home" } as unknown as NodeJS.ProcessEnv;

  it("round-trips work products through the store", async () => {
    const { fs } = fakeFs();
    await writeWorkProducts([seed()], env, fs);
    const read = await readWorkProducts(env, fs);
    expect(read).toHaveLength(1);
    expect(read[0]?.id).toBe("growth-wp-1");
    expect(read[0]?.departmentId).toBe("growth");
    expect(read[0]?.sourceTaskId).toBe("task-7");
  });

  it("returns [] when the file is missing (tolerant)", async () => {
    const { fs } = fakeFs();
    expect(await readWorkProducts(env, fs)).toEqual([]);
  });

  it("returns [] when the file is corrupt JSON (tolerant)", async () => {
    const { fs } = fakeFs("{ not json");
    expect(await readWorkProducts(env, fs)).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones (tolerant)", async () => {
    const raw = JSON.stringify({
      version: 1,
      workProducts: [seed(), { id: "broken" /* missing required provenance */ }, 42],
    });
    const { fs } = fakeFs(raw);
    const read = await readWorkProducts(env, fs);
    expect(read.map((p) => p.id)).toEqual(["growth-wp-1"]);
  });
});
