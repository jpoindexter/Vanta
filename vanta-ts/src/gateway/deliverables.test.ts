import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planDeliverables } from "./deliverables.js";
import type { WorkProduct } from "../cofounder/work-products.js";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("deliverable planner", () => {
  it("attaches supported recent in-scope paths and removes them from visible copy", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-deliverables-"));
    await mkdir(join(root, "out"));
    const report = join(root, "out", "report.pdf"), source = join(root, "out", "debug.log");
    await writeFile(report, "PDF"); await writeFile(source, "LOG");
    const plan = await planDeliverables({
      reply: `Done. Artifact: ${report}\nLog: ${source}`,
      root, env: {}, now: Date.now(), workProducts: [],
    });
    expect(plan.files).toMatchObject([{ name: "report.pdf", mime: "application/pdf" }]);
    expect(plan.files[0]?.path.endsWith("/out/report.pdf")).toBe(true);
    expect(plan.visibleText).not.toContain(report);
    expect(plan.visibleText).toContain("Done.");
    expect(plan.skipped.join("\n")).toContain("unsupported extension .log");
  });

  it("includes approved work products, dedupes paths, and refuses old/out-of-scope files", async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-deliverables-"));
    const csv = join(root, "results.csv"); await writeFile(csv, "a,b\n1,2\n");
    const products = [product(csv, true), product(join(tmpdir(), "outside.xlsx"), true), product(join(root, "draft.txt"), false)];
    const plan = await planDeliverables({
      reply: `Results: ${csv}`, root, env: {}, now: Date.now() + 2 * 60 * 60 * 1000,
      maxAgeMs: 60_000, workProducts: products,
    });
    expect(plan.files).toHaveLength(0);
    expect(plan.skipped.some((line) => line.includes("recently-produced artifact"))).toBe(true);
    expect(plan.skipped.some((line) => line.includes("outside"))).toBe(true);
  });
});

function product(artifact: string, approved: boolean): WorkProduct {
  return { id: artifact, artifact, kind: "document", sourceTaskId: "task", departmentId: "dept", producedBy: "agent", approved, createdAt: new Date().toISOString() };
}
