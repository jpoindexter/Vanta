import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCheck } from "./verifier.js";

describe("runCheck", () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "vanta-eval-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("file_exists passes when present, fails when absent", () => {
    writeFileSync(join(root, "hello.txt"), "hi");
    expect(runCheck({ kind: "file_exists", path: "hello.txt" }, root).pass).toBe(true);
    expect(runCheck({ kind: "file_exists", path: "nope.txt" }, root).pass).toBe(false);
  });

  it("file_contains checks substring presence", () => {
    writeFileSync(join(root, "a.txt"), "the quick brown fox");
    expect(runCheck({ kind: "file_contains", path: "a.txt", text: "brown" }, root).pass).toBe(true);
    expect(runCheck({ kind: "file_contains", path: "a.txt", text: "purple" }, root).pass).toBe(false);
  });

  it("file_contains fails (not throws) when the file is missing", () => {
    const out = runCheck({ kind: "file_contains", path: "ghost.txt", text: "x" }, root);
    expect(out.pass).toBe(false);
    expect(out.detail).toContain("missing");
  });

  it("shell_ok passes on exit 0 and fails on non-zero", () => {
    expect(runCheck({ kind: "shell_ok", cmd: "true" }, root).pass).toBe(true);
    expect(runCheck({ kind: "shell_ok", cmd: "false" }, root).pass).toBe(false);
  });
});
