import { describe, it, expect } from "vitest";
import { isCodeContent, compressTypeScript } from "./ast-compress.js";

describe("isCodeContent", () => {
  it("returns true for a file with import statements", () => {
    expect(isCodeContent('import { foo } from "bar";\nconst x = 1;')).toBe(true);
  });

  it("returns true for a file with export statements", () => {
    expect(isCodeContent("export function foo() { return 1; }")).toBe(true);
  });

  it("returns true for export type", () => {
    expect(isCodeContent("export type Foo = { id: string };")).toBe(true);
  });

  it("returns false for plain prose", () => {
    expect(isCodeContent("This is just a markdown document.\nNo imports here.")).toBe(false);
  });

  it("returns false for a log file", () => {
    expect(isCodeContent("[2025-01-01] INFO server started\n[2025-01-01] INFO ready")).toBe(false);
  });
});

const SIMPLE_FN = `import { z } from "zod";

export function compute(x: number): number {
  const doubled = x * 2;
  const tripled = x * 3;
  const result = doubled + tripled;
  return result;
}

export const VALUE = 42;
`;

describe("compressTypeScript", () => {
  it("elides a function body with >= 4 lines", () => {
    const out = compressTypeScript(SIMPLE_FN);
    expect(out).toContain("export function compute(x: number): number");
    expect(out).not.toContain("const doubled");
    expect(out).toContain("/* …");
  });

  it("preserves imports", () => {
    const out = compressTypeScript(SIMPLE_FN);
    expect(out).toContain('import { z } from "zod"');
  });

  it("preserves top-level constants outside functions", () => {
    const out = compressTypeScript(SIMPLE_FN);
    expect(out).toContain("export const VALUE = 42");
  });

  it("returns the original when no bodies are large enough to elide", () => {
    const short = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;
    const out = compressTypeScript(short);
    expect(out).toBe(short);
  });

  it("handles multiple functions, eliding each body independently", () => {
    const multi = `export function a() {\n  const x = 1;\n  const y = 2;\n  const z = 3;\n  return x + y + z;\n}\nexport function b() {\n  const p = 4;\n  const q = 5;\n  const r = 6;\n  return p + q + r;\n}\n`;
    const out = compressTypeScript(multi);
    expect(out).toContain("export function a()");
    expect(out).toContain("export function b()");
    expect(out).not.toContain("const x = 1");
    expect(out).not.toContain("const p = 4");
  });

  it("keeps interface and type declarations untouched", () => {
    const src = `export interface Config {\n  port: number;\n  host: string;\n}\nexport type Status = "active" | "inactive";\n`;
    const out = compressTypeScript(src);
    expect(out).toBe(src);
  });
});
