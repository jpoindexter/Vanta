import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changesProduct, snapshotTree } from "./git-changes.js";

let dir: string;
const git = (...args: string[]): string => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vanta-wr-git-"));
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "a.txt"), "one\n");
  writeFileSync(join(dir, "b.txt"), "two\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("changed files", () => {
  it("is not a repo: no snapshot and no product", async () => {
    const plain = mkdtempSync(join(tmpdir(), "vanta-wr-plain-"));
    expect(await snapshotTree(plain)).toBeNull();
    expect(await changesProduct(plain, null)).toBeUndefined();
    rmSync(plain, { recursive: true, force: true });
  });

  it("reports nothing when the run changed nothing", async () => {
    expect(await changesProduct(dir, await snapshotTree(dir))).toBeUndefined();
  });

  it("lists modified, new and deleted files with a diff stat", async () => {
    const before = await snapshotTree(dir);
    writeFileSync(join(dir, "a.txt"), "one\nmore\n");
    writeFileSync(join(dir, "new.txt"), "fresh\n");
    rmSync(join(dir, "b.txt"));
    const product = await changesProduct(dir, before);
    expect(product).toMatchObject({ kind: "code", source: "git-diff", files: ["a.txt", "b.txt", "new.txt"] });
    expect(product!.content).toContain("Changed 3 files");
    expect(product!.content).toContain("a.txt");
  });

  it("ignores files that were already dirty before the run and did not change", async () => {
    writeFileSync(join(dir, "a.txt"), "dirty before\n");
    const before = await snapshotTree(dir);
    writeFileSync(join(dir, "c.txt"), "x\n");
    expect((await changesProduct(dir, before))!.files).toEqual(["c.txt"]);
  });

  it("counts a file that was dirty and then changed again", async () => {
    writeFileSync(join(dir, "a.txt"), "dirty before\n");
    const before = await snapshotTree(dir);
    writeFileSync(join(dir, "a.txt"), "dirty and edited\n");
    expect((await changesProduct(dir, before))!.files).toEqual(["a.txt"]);
  });

  it("sees a commit the agent made", async () => {
    const before = await snapshotTree(dir);
    writeFileSync(join(dir, "a.txt"), "committed\n");
    git("commit", "-q", "-am", "agent commit");
    expect((await changesProduct(dir, before))!.files).toEqual(["a.txt"]);
  });

  it("skips Vanta's own .vanta state", async () => {
    const before = await snapshotTree(dir);
    mkdirSync(join(dir, ".vanta"));
    writeFileSync(join(dir, ".vanta", "budgets.json"), "{}");
    expect(await changesProduct(dir, before)).toBeUndefined();
  });
});
