import { describe, it, expect } from "vitest";
import { analyzeSource, formatViolation, LIMITS } from "./size.js";

describe("analyzeSource", () => {
  it("passes a small, simple file", () => {
    const src = `export function add(a: number, b: number): number { return a + b; }\n`;
    expect(analyzeSource("ok.ts", src)).toEqual([]);
  });

  it("flags a file over the line limit", () => {
    const src = Array.from({ length: 305 }, (_, i) => `const x${i} = ${i};`).join("\n");
    const v = analyzeSource("big.ts", src);
    expect(v.some((x) => x.kind === "file" && x.actual > LIMITS.file)).toBe(true);
  });

  it("flags a function over the length limit", () => {
    const body = Array.from({ length: 60 }, (_, i) => `  const y${i} = ${i};`).join("\n");
    const src = `function longOne() {\n${body}\n  return 1;\n}\n`;
    const v = analyzeSource("fn.ts", src);
    const hit = v.find((x) => x.kind === "function");
    expect(hit?.name).toBe("longOne");
    expect(hit!.actual).toBeGreaterThan(LIMITS.func);
  });

  it("flags too many parameters", () => {
    const src = `function many(a: number, b: number, c: number, d: number, e: number) { return a; }\n`;
    const v = analyzeSource("p.ts", src);
    expect(v.some((x) => x.kind === "params" && x.actual === 5 && x.name === "many")).toBe(true);
  });

  it("flags high cyclomatic complexity (counts &&/|| and branches)", () => {
    const branches = Array.from({ length: 12 }, (_, i) => `  if (n === ${i}) return ${i};`).join("\n");
    const src = `function branchy(n: number) {\n${branches}\n  return -1;\n}\n`;
    const v = analyzeSource("cx.ts", src);
    expect(v.some((x) => x.kind === "complexity" && x.actual > LIMITS.complexity)).toBe(true);
  });

  it("does not double-count a nested function's complexity onto the outer", () => {
    const src = `function outer() {\n  const inner = (n: number) => (n > 0 && n < 10 ? 1 : 0);\n  return inner;\n}\n`;
    const v = analyzeSource("nest.ts", src);
    // outer has no decision points of its own → no complexity violation
    expect(v.some((x) => x.kind === "complexity" && x.name === "outer")).toBe(false);
  });

  it("formats a violation as file:line + metric + limit + fix", () => {
    const line = formatViolation({ file: "a.ts", line: 12, kind: "function", actual: 80, limit: 50, name: "foo", fix: "extract helpers" });
    expect(line).toContain("a.ts:12");
    expect(line).toContain("function foo 80 > 50");
    expect(line).toContain("extract helpers");
  });
});
