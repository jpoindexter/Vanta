import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDiagnostics, getDefinition } from "./ts-service.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vanta-lsp-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("getDiagnostics", () => {
  it("reports a type error with category 'error'", async () => {
    const file = join(dir, "bad.ts");
    await writeFile(file, "const n: number = 'oops';\n");
    const diags = getDiagnostics(file);
    const errors = diags.filter((d) => d.category === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toMatch(/not assignable/i);
    expect(errors[0]?.line).toBe(1);
  });

  it("returns no errors for valid code", async () => {
    const file = join(dir, "ok.ts");
    await writeFile(file, "const n: number = 1;\nexport const m = n + 1;\n");
    const errors = getDiagnostics(file).filter((d) => d.category === "error");
    expect(errors).toEqual([]);
  });
});

describe("getDefinition", () => {
  it("resolves a local const use to its declaration (1-based)", async () => {
    const file = join(dir, "ref.ts");
    // line 1 declares `foo`; line 2 uses it at character 13 (1-based).
    await writeFile(file, "const foo = 1;\nconst bar = foo;\n");
    const defs = getDefinition(file, 2, 13);
    expect(defs.length).toBeGreaterThan(0);
    const def = defs[0]!;
    expect(def.file).toBe(file);
    expect(def.line).toBe(1);
    // `foo` identifier starts at character 7 (1-based) on line 1.
    expect(def.character).toBe(7);
  });
});
