import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile, mkdir } from "node:fs/promises";
import { classifyTouchedFiles, checkNoProtectedPaths, checkNoExistingTestModified, checkNewFilesUnderLineLimit, buildVerifyChecks, verify } from "./verifier.js";

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "vanta-verifier-")); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe("classifyTouchedFiles", () => {
  it("separates new test files from other touched files", () => {
    const { newTestFiles, otherFiles } = classifyTouchedFiles(
      ["src/factory/foo.ts", "src/factory/foo.test.ts", "ROADMAP.md"],
      new Set(["src/factory/foo.ts", "ROADMAP.md"]),
    );
    expect(newTestFiles).toEqual(["src/factory/foo.test.ts"]);
    expect(otherFiles).toContain("src/factory/foo.ts");
  });

  it("treats a pre-existing test file as non-new", () => {
    const { newTestFiles } = classifyTouchedFiles(
      ["src/foo.test.ts"],
      new Set(["src/foo.test.ts"]),
    );
    expect(newTestFiles).toHaveLength(0);
  });
});

describe("checkNoProtectedPaths", () => {
  it("returns ok:true for safe files", () => {
    const r = checkNoProtectedPaths(["vanta-ts/src/tools/new-tool.ts", "ROADMAP.md"], tmp);
    expect(r.ok).toBe(true);
  });

  it("returns ok:false for factory source files", () => {
    const r = checkNoProtectedPaths(["vanta-ts/src/factory/run.ts", "ROADMAP.md"], tmp);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/protected/);
  });

  it("returns ok:false for kernel Rust source", () => {
    const r = checkNoProtectedPaths(["src/safety.rs"], tmp);
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for MANIFESTO.md", () => {
    const r = checkNoProtectedPaths(["MANIFESTO.md"], tmp);
    expect(r.ok).toBe(false);
  });

  it("returns ok:false for Cargo.toml", () => {
    const r = checkNoProtectedPaths(["Cargo.toml"], tmp);
    expect(r.ok).toBe(false);
  });
});

describe("checkNoExistingTestModified", () => {
  it("returns ok:true when only new test files are touched", () => {
    const preExisting = new Set(["src/foo.ts"]);
    const touched = ["src/foo.ts", "src/foo.test.ts"]; // foo.test.ts is NEW
    const r = checkNoExistingTestModified(touched, preExisting);
    expect(r.ok).toBe(true);
  });

  it("returns ok:false when a pre-existing test file is modified", () => {
    const preExisting = new Set(["src/foo.test.ts", "src/foo.ts"]);
    const touched = ["src/foo.ts", "src/foo.test.ts"];
    const r = checkNoExistingTestModified(touched, preExisting);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/existing test/);
  });

  it("returns ok:true for empty touched list", () => {
    expect(checkNoExistingTestModified([], new Set(["src/foo.test.ts"])).ok).toBe(true);
  });
});

describe("checkNewFilesUnderLineLimit", () => {
  it("returns ok:true when all new source files are under the limit", async () => {
    const file = join(tmp, "small.ts");
    await writeFile(file, "const x = 1;\n".repeat(50));
    const r = await checkNewFilesUnderLineLimit([file], 300);
    expect(r.ok).toBe(true);
  });

  it("returns ok:false when a new source file exceeds the limit", async () => {
    const file = join(tmp, "big.ts");
    await writeFile(file, "const x = 1;\n".repeat(301));
    const r = await checkNewFilesUnderLineLimit([file], 300);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/301.*lines/);
    expect(r.reason).toMatch(/big\.ts/);
  });

  it("returns ok:true for an empty list", async () => {
    expect((await checkNewFilesUnderLineLimit([], 300)).ok).toBe(true);
  });

  it("returns ok:true for files in subdirectories", async () => {
    await mkdir(join(tmp, "sub"), { recursive: true });
    const file = join(tmp, "sub", "ok.ts");
    await writeFile(file, "export const x = 1;\n".repeat(10));
    const r = await checkNewFilesUnderLineLimit([file], 300);
    expect(r.ok).toBe(true);
  });
});

describe("verify chain (PORT-FACTORY-DEPS)", () => {
  it("registers checks in a stable order with the holdout seam wired", () => {
    const names = buildVerifyChecks().map((c) => c.name);
    expect(names[0]).toBe("protected-paths");
    expect(names).toEqual([
      "protected-paths",
      "no-existing-test-modified",
      "new-files-size",
      "new-tests-fail-on-prechange",
      "affected-tests",
      "full-suite",
      "tsc",
      "intent-judge",
      "holdout",
    ]);
  });

  it("short-circuits on the first failing check without running git/tsc", async () => {
    // A protected path fails the first check; verify must return immediately and
    // never reach the suite/tsc checks (which would need a real repo).
    const artifact = { newTestFiles: [], touchedFiles: ["src/safety.rs"], tokenSpend: 0 };
    const r = await verify(tmp, artifact, new Set());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/protected path/i);
  });
});
