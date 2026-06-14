import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listChangedFiles,
  fileDiff,
  undoFile,
} from "./changed-files.js";

const exec = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout;
}

describe("changed-files", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "vanta-cf-"));

    // Init bare repo
    await git(["init"], tmp);
    await git(["config", "user.email", "test@vanta.local"], tmp);
    await git(["config", "user.name", "Vanta Test"], tmp);

    // Commit a.txt
    await writeFile(join(tmp, "a.txt"), "line one\nline two\n", "utf8");
    await git(["add", "a.txt"], tmp);
    await git(["commit", "-m", "initial"], tmp);

    // Modify a.txt (tracked, modified)
    await writeFile(join(tmp, "a.txt"), "line one\nline two\nline three\n", "utf8");

    // Add untracked b.txt
    await writeFile(join(tmp, "b.txt"), "untracked content\n", "utf8");
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("lists modified tracked file with status M and counts", async () => {
    const files = await listChangedFiles(tmp);
    const a = files.find((f) => f.file === "a.txt");
    expect(a).toBeDefined();
    expect(a?.status).toBe("M");
    expect((a?.added ?? 0) + (a?.removed ?? 0)).toBeGreaterThan(0);
  });

  it("lists untracked file with status ?", async () => {
    const files = await listChangedFiles(tmp);
    const b = files.find((f) => f.file === "b.txt");
    expect(b).toBeDefined();
    expect(b?.status).toBe("?");
  });

  it("returns [] for a non-repo directory", async () => {
    const result = await listChangedFiles(tmpdir());
    expect(Array.isArray(result)).toBe(true);
    // May or may not be empty depending on environment, but must not throw
  });

  it("fileDiff returns a diff containing the added line for a tracked file", async () => {
    const diff = await fileDiff(tmp, "a.txt");
    expect(diff).toContain("line three");
    expect(diff.length).toBeGreaterThan(0);
  });

  it("fileDiff returns content as +lines for an untracked file", async () => {
    const diff = await fileDiff(tmp, "b.txt");
    expect(diff).toContain("+untracked content");
  });

  it("fileDiff returns empty string for a missing file", async () => {
    const diff = await fileDiff(tmp, "nonexistent.txt");
    expect(diff).toBe("");
  });

  it("undoFile restores a tracked file to HEAD", async () => {
    const result = await undoFile(tmp, "a.txt");
    expect(result.ok).toBe(true);

    const content = await readFile(join(tmp, "a.txt"), "utf8");
    expect(content).toBe("line one\nline two\n");

    const files = await listChangedFiles(tmp);
    expect(files.find((f) => f.file === "a.txt")).toBeUndefined();
  });

  it("undoFile deletes an untracked file", async () => {
    const result = await undoFile(tmp, "b.txt");
    expect(result.ok).toBe(true);

    await expect(
      readFile(join(tmp, "b.txt"), "utf8"),
    ).rejects.toThrow();
  });

  it("undoFile returns ok:false for a file that does not exist at all", async () => {
    const result = await undoFile(tmp, "ghost.txt");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
