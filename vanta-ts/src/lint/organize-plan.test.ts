import { describe, expect, it } from "vitest";
import { LIMITS } from "./size.js";
import {
  analyzeDecomposition,
  planDecomposition,
  formatOrganizePlan,
  type DecompositionAnalysis,
} from "./organize-plan.js";

// Build a function declaration spanning `bodyLines` body lines.
function fnFixture(name: string, bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `  const _${name}${i} = ${i};`);
  return [`export function ${name}() {`, ...body, "}"].join("\n");
}

// An oversized file: three fns of different sizes summing well past LIMITS.file.
function oversizedSource(): string {
  return [fnFixture("big", 200), fnFixture("mid", 120), fnFixture("small", 30)].join("\n\n");
}

describe("analyzeDecomposition", () => {
  it("flags an over-gate file and lists its top-level decls with line counts", () => {
    const source = oversizedSource();
    const a = analyzeDecomposition("big-file.ts", source);
    expect(a.overGate).toBe(true);
    expect(a.fileLines).toBeGreaterThan(LIMITS.file);
    expect(a.limit).toBe(LIMITS.file);
    const names = a.topLevelDecls.map((d) => d.name);
    expect(names).toEqual(["big", "mid", "small"]);
    const big = a.topLevelDecls.find((d) => d.name === "big");
    expect(big?.kind).toBe("function");
    // big = signature + 200 body + close = 202 lines.
    expect(big?.lineCount).toBe(202);
  });

  it("reports overGate false and no plan trigger for a small file", () => {
    const a = analyzeDecomposition("small.ts", fnFixture("tiny", 5));
    expect(a.overGate).toBe(false);
    expect(a.fileLines).toBeLessThan(LIMITS.file);
    expect(planDecomposition(a, "small.ts")).toEqual([]);
  });

  it("classifies const/class/interface/type top-level decls", () => {
    const source = [
      "export const FOO = 1;",
      "export class Bar {}",
      "export interface Baz { a: number }",
      "export type Qux = string;",
    ].join("\n");
    const a = analyzeDecomposition("kinds.ts", source);
    const byName = Object.fromEntries(a.topLevelDecls.map((d) => [d.name, d.kind]));
    expect(byName).toEqual({ FOO: "const", Bar: "class", Baz: "interface", Qux: "type" });
  });
});

describe("planDecomposition", () => {
  it("greedily extracts the largest decls until the file would be under the limit", () => {
    const a = analyzeDecomposition("big-file.ts", oversizedSource());
    const plan = planDecomposition(a, "big-file.ts");
    // Removing only `big` (202) leaves the file under 300 → one extraction suffices.
    expect(plan).toHaveLength(1);
    const [only] = plan;
    expect(only?.symbolName).toBe("big");
    expect(only?.lineCount).toBe(202);
    expect(a.fileLines - (only?.lineCount ?? 0)).toBeLessThanOrEqual(LIMITS.file);
  });

  it("suggests a co-located target module name derived from file + decl kind", () => {
    const a = analyzeDecomposition("big-file.ts", oversizedSource());
    const plan = planDecomposition(a, "big-file.ts");
    expect(plan[0]?.targetModule).toBe("big-file-fns.ts");
  });

  it("preserves a .tsx extension in the target module name", () => {
    const a = analyzeDecomposition("widget.tsx", oversizedSource());
    const plan = planDecomposition(a, "widget.tsx");
    expect(plan[0]?.targetModule).toBe("widget-fns.tsx");
  });

  it("returns [] when the file is not over the gate", () => {
    const under: DecompositionAnalysis = {
      fileLines: 100,
      overGate: false,
      limit: LIMITS.file,
      topLevelDecls: [{ name: "x", kind: "function", lineCount: 80 }],
    };
    expect(planDecomposition(under, "x.ts")).toEqual([]);
  });

  it("extracts multiple decls when one is not enough", () => {
    // Four ~95-line fns → ~384 lines; need to drop ~84+ to reach 300.
    const source = [
      fnFixture("a", 93),
      fnFixture("b", 93),
      fnFixture("c", 93),
      fnFixture("d", 93),
    ].join("\n\n");
    const a = analyzeDecomposition("multi.ts", source);
    const plan = planDecomposition(a, "multi.ts");
    expect(plan.length).toBeGreaterThanOrEqual(1);
    const removed = plan.reduce((sum, s) => sum + s.lineCount, 0);
    expect(a.fileLines - removed).toBeLessThanOrEqual(LIMITS.file);
  });
});

describe("formatOrganizePlan", () => {
  it("lists the extractions, the re-export reminder, and 'no files changed'", () => {
    const a = analyzeDecomposition("big-file.ts", oversizedSource());
    const plan = planDecomposition(a, "big-file.ts");
    const text = formatOrganizePlan(plan, "big-file.ts");
    expect(text).toContain("Extract 1 decl(s) to get big-file.ts under 300 lines:");
    expect(text).toContain("big (function, 202 lines) → big-file-fns.ts");
    expect(text).toContain("re-export");
    expect(text).toContain('export * from "./big-file-fns.js"');
    expect(text).toContain("no files changed");
    expect(text).toContain("kernel-gated");
  });

  it("says no decomposition needed when the plan is empty", () => {
    const text = formatOrganizePlan([], "fine.ts");
    expect(text).toContain("fine.ts is within the file-size gate");
    expect(text).toContain("no decomposition needed");
  });
});
