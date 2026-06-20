import { describe, it, expect } from "vitest";
import {
  formatLibrary,
  formatWorkProduct,
  parseLibraryListArgs,
  runLibraryWith,
  selectWorkProducts,
  type LibraryDeps,
} from "./library-cmd.js";
import { recordWorkProduct, type WorkProduct } from "../cofounder/work-products.js";

const NOW = new Date("2026-06-20T12:00:00.000Z");

function product(
  spec: Partial<Parameters<typeof recordWorkProduct>[1]> & { createdAt?: Date },
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
    spec.createdAt ?? NOW,
  );
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

type Harness = { deps: LibraryDeps; lines: string[] };

function harness(rows: WorkProduct[] = []): Harness {
  const lines: string[] = [];
  return {
    lines,
    deps: {
      readWorkProducts: async () => rows,
      log: (line) => lines.push(line),
    },
  };
}

describe("parseLibraryListArgs", () => {
  it("defaults to all departments, all approval states", () => {
    const r = parseLibraryListArgs([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.deptId).toBeUndefined();
    expect(r.value.approval).toBe("all");
  });

  it("parses --dept", () => {
    const r = parseLibraryListArgs(["--dept", "growth"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.deptId).toBe("growth");
  });

  it("parses --approved and --pending", () => {
    const approved = parseLibraryListArgs(["--approved"]);
    const pending = parseLibraryListArgs(["--pending"]);
    expect(approved.ok && approved.value.approval).toBe("approved");
    expect(pending.ok && pending.value.approval).toBe("pending");
  });

  it("rejects --approved and --pending together", () => {
    const r = parseLibraryListArgs(["--approved", "--pending"]);
    expect(r.ok).toBe(false);
  });

  it("rejects --dept with no value", () => {
    const r = parseLibraryListArgs(["--dept", "--approved"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/--dept needs/);
  });
});

describe("selectWorkProducts", () => {
  const growthPending = product({ artifact: "g1" });
  const growthApproved = product({ artifact: "g2", approved: true }, [growthPending]);
  const brandApproved = product({ artifact: "b1", departmentId: "brand", approved: true }, [growthPending, growthApproved]);
  const all = [growthPending, growthApproved, brandApproved];

  it("returns everything by default", () => {
    expect(selectWorkProducts(all, { approval: "all" })).toHaveLength(3);
  });

  it("filters by department", () => {
    const rows = selectWorkProducts(all, { deptId: "growth", approval: "all" });
    expect(rows.map((p) => p.artifact).sort()).toEqual(["g1", "g2"]);
  });

  it("filters by approval state", () => {
    expect(selectWorkProducts(all, { approval: "approved" }).map((p) => p.artifact).sort()).toEqual(["b1", "g2"]);
    expect(selectWorkProducts(all, { approval: "pending" }).map((p) => p.artifact)).toEqual(["g1"]);
  });

  it("composes department + approval filters", () => {
    const rows = selectWorkProducts(all, { deptId: "growth", approval: "pending" });
    expect(rows.map((p) => p.artifact)).toEqual(["g1"]);
  });
});

describe("formatWorkProduct / formatLibrary", () => {
  it("renders an artifact line with full provenance + approval mark", () => {
    const line = formatWorkProduct(product({ artifact: "logo.svg", kind: "design", departmentId: "brand", producedBy: "muse", sourceTaskId: "task-12" }));
    expect(line).toMatch(/logo\.svg/);
    expect(line).toMatch(/design/);
    expect(line).toMatch(/brand/);
    expect(line).toMatch(/by muse/);
    expect(line).toMatch(/from task-12/);
    expect(line).toMatch(/· pending/);
  });

  it("marks approved artifacts", () => {
    expect(formatWorkProduct(product({ approved: true }))).toMatch(/✔ approved/);
  });

  it("renders an empty-state line scoped to the filter", () => {
    const text = formatLibrary([], { deptId: "growth", approval: "pending" });
    expect(text).toMatch(/no work products for "growth" \(pending\)/);
  });

  it("renders a header summarising scope + count", () => {
    const text = formatLibrary([product({})], { deptId: "growth", approval: "all" });
    expect(text).toMatch(/dept:growth · all · 1 artifact/);
  });
});

describe("runLibraryWith", () => {
  it("lists all artifacts (bare command defaults to list)", async () => {
    const rows = [product({ artifact: "g1" }), product({ artifact: "b1", departmentId: "brand" })];
    const h = harness(rows);
    expect(await runLibraryWith([], h.deps)).toBe(0);
    const out = h.lines.join("\n");
    expect(out).toMatch(/g1/);
    expect(out).toMatch(/b1/);
  });

  it("filters the listing by department and approval", async () => {
    const a = product({ artifact: "g1" });
    const b = product({ artifact: "g2", approved: true }, [a]);
    const c = product({ artifact: "b1", departmentId: "brand" }, [a, b]);
    const h = harness([a, b, c]);
    expect(await runLibraryWith(["list", "--dept", "growth", "--approved"], h.deps)).toBe(0);
    const out = h.lines.join("\n");
    expect(out).toMatch(/g2/);
    expect(out).not.toMatch(/g1/); // pending — excluded
    expect(out).not.toMatch(/b1/); // brand — excluded
  });

  it("returns 1 + usage on a bad filter combo", async () => {
    const h = harness();
    expect(await runLibraryWith(["list", "--approved", "--pending"], h.deps)).toBe(1);
    expect(h.lines.join("\n")).toMatch(/usage:/);
  });

  it("returns 1 + usage on an unknown subcommand", async () => {
    const h = harness();
    expect(await runLibraryWith(["wat"], h.deps)).toBe(1);
    expect(h.lines.join("\n")).toMatch(/usage:/);
  });
});
