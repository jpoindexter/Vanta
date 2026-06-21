import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTaskArtifactProbe } from "./task-outcome-probe.js";
import { writeWorkProducts, recordWorkProduct, type WorkProduct } from "../cofounder/work-products.js";

describe("resolveTaskArtifactProbe", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "vanta-outcome-probe-"));
    env = { VANTA_HOME: home } as NodeJS.ProcessEnv;
  });
  afterEach(async () => { await rm(home, { recursive: true, force: true }); });

  it("default-safe: a missing store yields a probe that finds no artifact", async () => {
    const probe = await resolveTaskArtifactProbe("t1", env);
    expect(probe("document")).toBe(false);
  });

  it("probe is true once the task has a recorded work-product", async () => {
    const made = recordWorkProduct([], {
      artifact: "the report",
      sourceTaskId: "t1",
      departmentId: "eng",
      producedBy: "w1",
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    await writeWorkProducts([made.value], env);

    const probe = await resolveTaskArtifactProbe("t1", env);
    expect(probe("document")).toBe(true);
  });

  it("probe is false for a task with no artifact even when the store has others", async () => {
    const products: WorkProduct[] = [];
    const made = recordWorkProduct(products, {
      artifact: "other dept output",
      sourceTaskId: "other-task",
      departmentId: "ops",
      producedBy: "w2",
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    await writeWorkProducts([made.value], env);

    const probe = await resolveTaskArtifactProbe("t1", env);
    expect(probe("document")).toBe(false);
  });
});
