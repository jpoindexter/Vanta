import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyTouchedFiles, checkNoProtectedPaths, checkNoExistingTestModified } from "./verifier.js";

let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(join(tmpdir(), "argo-verifier-")); });
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
    const r = checkNoProtectedPaths(["argo-ts/src/tools/new-tool.ts", "ROADMAP.md"], tmp);
    expect(r.ok).toBe(true);
  });

  it("returns ok:false for factory source files", () => {
    const r = checkNoProtectedPaths(["argo-ts/src/factory/run.ts", "ROADMAP.md"], tmp);
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
