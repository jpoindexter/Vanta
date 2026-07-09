import { describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkIntentDrift, extractIntentSpec, extractIntentSpecFile, writeIntentSpec } from "./spec.js";

describe("intent spec recovery", () => {
  it("extracts a reviewable spec from code", () => {
    const spec = extractIntentSpec("math.ts", "export function addNumbers(a: number, b: number) { return a + b; }\nclass Helper {}");
    expect(spec.exports).toContain("addNumbers");
    expect(spec.functions).toContain("addNumbers");
    expect(spec.classes).toContain("Helper");
    expect(spec.signals).toContain("numbers");
    expect(spec.review).toContain("Reviewable intent");
  });

  it("flags drift when a later file removes the recovered public surface", async () => {
    const dir = join(tmpdir(), `vanta-intent-${Date.now()}`);
    const target = join(dir, "math.ts");
    const specPath = join(dir, "math.intent.json");
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(target, "export function addNumbers(a: number, b: number) { return a + b; }\n");
      await writeIntentSpec(specPath, await extractIntentSpecFile(target));
      await writeFile(target, "export function subtractNumbers(a: number, b: number) { return a - b; }\n");
      const drift = await checkIntentDrift(target, specPath);
      expect(drift.ok).toBe(false);
      expect(drift.drift).toContain("export drift: missing addNumbers");
      expect(drift.drift).toContain("signal drift: missing add");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
