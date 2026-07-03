import { describe, it, expect } from "vitest";
import { buildPlan, augmentPlanWithCodeIntel } from "./planner.js";
import { affectedTestPaths, buildVerifyChecks } from "./verifier.js";
import { ok, err, nullProvider, type CodeIntelProvider } from "../code-intel/provider.js";
import type { SliceArtifact, VerifyCheckCtx, WorkItem } from "./types.js";

// CODE-INTEL-FACTORY-WIRING — the wiring is ADDITIVE + GUARDED: when code intelligence is
// unavailable, planner + verifier behave exactly as before. These tests pin both branches.

function fakeCodeIntel(over: Partial<CodeIntelProvider> = {}): CodeIntelProvider {
  return {
    id: "fake",
    available: async () => true,
    context: async () => ok(""),
    search: async () => ok(""),
    affected: async () => ok(""),
    ensureIndexed: async () => ok(""),
    ...over,
  };
}

const ITEM: WorkItem = { category: "roadmap", description: "wire the thing" };

describe("augmentPlanWithCodeIntel — planner injection", () => {
  const plan = buildPlan(ITEM, "/root");

  it("appends a code map additively when the provider is available", async () => {
    const out = await augmentPlanWithCodeIntel(plan, fakeCodeIntel({ context: async () => ok("export class Foo {}") }));
    expect(out.instruction.startsWith(plan.instruction)).toBe(true); // original instruction preserved
    expect(out.instruction).toContain("CODE MAP");
    expect(out.instruction).toContain("export class Foo {}");
    expect(out.workItem).toBe(plan.workItem); // rest of the plan untouched
  });

  it("leaves the plan byte-identical when code intel is unavailable", async () => {
    expect(await augmentPlanWithCodeIntel(plan, nullProvider)).toEqual(plan);
    const off = await augmentPlanWithCodeIntel(plan, fakeCodeIntel({ available: async () => false }));
    expect(off.instruction).toBe(plan.instruction);
  });

  it("leaves the plan unchanged on a failed or empty context lookup", async () => {
    const failed = await augmentPlanWithCodeIntel(plan, fakeCodeIntel({ context: async () => err("no index") }));
    expect(failed.instruction).toBe(plan.instruction);
    const empty = await augmentPlanWithCodeIntel(plan, fakeCodeIntel({ context: async () => ok("  \n ") }));
    expect(empty.instruction).toBe(plan.instruction);
  });
});

describe("affectedTestPaths — safe parse of an affected() report", () => {
  const tsRoot = process.cwd(); // vitest runs from vanta-ts/, so src/... resolves here

  it("extracts existing *.test.ts paths and strips a leading vanta-ts/", () => {
    const report = "affected:\n- vanta-ts/src/factory/planner.test.ts\n- src/factory/verifier.test.ts\n";
    const paths = affectedTestPaths(report, tsRoot);
    expect(paths).toContain("src/factory/planner.test.ts");
    expect(paths).toContain("src/factory/verifier.test.ts");
  });

  it("drops stale/nonexistent paths and dedups so garbage never false-fails a slice", () => {
    const report = "src/does/not/exist.test.ts and src/factory/planner.test.ts and src/factory/planner.test.ts";
    expect(affectedTestPaths(report, tsRoot)).toEqual(["src/factory/planner.test.ts"]);
  });

  it("returns nothing for a report with no test paths", () => {
    expect(affectedTestPaths("no tests here, just prose", tsRoot)).toEqual([]);
  });
});

describe("affected-tests verify check — guarded, additive, never weakens the floor", () => {
  const check = buildVerifyChecks().find((c) => c.name === "affected-tests")!;
  const artifact: SliceArtifact = { newTestFiles: [], touchedFiles: ["src/factory/planner.ts"], tokenSpend: 0 };
  const ctx = (codeIntel?: CodeIntelProvider): VerifyCheckCtx => ({
    root: process.cwd(),
    tsRoot: process.cwd(),
    artifact,
    preExisting: new Set(),
    opts: codeIntel ? { codeIntel } : undefined,
  });

  it("runs before the full-suite check (fast-fail pre-gate, not a replacement)", () => {
    const names = buildVerifyChecks().map((c) => c.name);
    expect(names.indexOf("affected-tests")).toBeLessThan(names.indexOf("full-suite"));
  });

  it("no-ops when no provider is supplied", async () => {
    expect(await check.run(ctx())).toEqual({ ok: true });
  });

  it("no-ops when the provider is unavailable or affected() fails", async () => {
    expect(await check.run(ctx(fakeCodeIntel({ available: async () => false })))).toEqual({ ok: true });
    expect(await check.run(ctx(fakeCodeIntel({ affected: async () => err("no index") })))).toEqual({ ok: true });
  });

  it("no-ops when affected() names no existing test files (never runs garbage)", async () => {
    expect(await check.run(ctx(fakeCodeIntel({ affected: async () => ok("src/nope.test.ts") })))).toEqual({ ok: true });
  });
});
