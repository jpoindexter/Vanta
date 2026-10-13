import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { baseBranchList, branchList, scanRepos, worktreeList } from "./git-branches";
import { safeRelativeFile, type GitContext } from "./git-common";
import { fileDiff, reviewDiff, revParse } from "./git-diff";
import { repoStatus, reviewList } from "./git-read";
import { createGitRunner } from "./git-runner";
import { git, initRepo, makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;
let ctx: GitContext;

beforeEach(() => {
  box = makeSandbox();
  initRepo(box.root);
  ctx = { git: createGitRunner(), guard: box.guard };
});

afterEach(() => box.cleanup());

function dirty(): void {
  write(path.join(box.root, "a.txt"), "one\ntwo\nthree\n");
  write(path.join(box.root, "staged.txt"), "s1\ns2\n");
  git(box.root, "add", "staged.txt");
  write(path.join(box.root, "fresh.txt"), "n1\nn2\nn3\n");
}

describe("repoStatus", () => {
  it("reports the branch, counts and changed files of a dirty repository", async () => {
    dirty();

    const status = await repoStatus(ctx, box.root);

    expect(status).toMatchObject({
      added: 1 + 2 + 3,
      branch: "main",
      changed: 3,
      defaultBranch: "main",
      detached: false,
      removed: 0,
      staged: 1,
      unstaged: 1,
      untracked: 1
    });
    expect(status?.files.map(file => file.path).sort()).toEqual(["a.txt", "fresh.txt", "staged.txt"]);
  });

  it("is null for a folder that is not a repository", async () => {
    const plain = makeSandbox();

    try {
      expect(await repoStatus({ git: ctx.git, guard: plain.guard }, plain.root)).toBeNull();
    } finally {
      plain.cleanup();
    }
  });

  it("is null for a path outside the project", async () => {
    expect(await repoStatus(ctx, box.outside)).toBeNull();
  });

  it("never lists a secret file, even an untracked one", async () => {
    write(path.join(box.root, ".env"), "KEY=1\n");
    write(path.join(box.root, "ok.txt"), "x\n");

    const status = await repoStatus(ctx, box.root);

    expect(status?.files.map(file => file.path)).toEqual(["ok.txt"]);
  });
});

describe("reviewList", () => {
  it("lists uncommitted changes with counts and status letters, untracked files counted from disk", async () => {
    dirty();

    const { files } = await reviewList(ctx, box.root, "uncommitted", null);

    expect(files).toEqual([
      { added: 1, path: "a.txt", removed: 0, staged: false, status: "M" },
      { added: 3, path: "fresh.txt", removed: 0, staged: false, status: "?" },
      { added: 2, path: "staged.txt", removed: 0, staged: true, status: "A" }
    ]);
  });

  it("lists changes since a captured commit for the last-turn scope, including new files", async () => {
    const base = (await revParse(ctx, box.root, "HEAD")) as string;
    dirty();

    const { base: echoed, files } = await reviewList(ctx, box.root, "lastTurn", base);

    expect(echoed).toBe(base);
    expect(files.map(file => file.path)).toEqual(["a.txt", "fresh.txt", "staged.txt"]);
  });

  it("lists a branch's commits against the trunk for the branch scope", async () => {
    git(box.root, "checkout", "-q", "-b", "feat");
    write(path.join(box.root, "feat.txt"), "f\n");
    git(box.root, "add", "-A");
    git(box.root, "commit", "-q", "-m", "feat");

    const { base, files } = await reviewList(ctx, box.root, "branch", null);

    expect(base).toMatch(/^[0-9a-f]{40}$/);
    expect(files.map(file => file.path)).toEqual(["feat.txt"]);
  });

  it("answers empty for the last-turn scope without a base, and for a bad base ref", async () => {
    expect(await reviewList(ctx, box.root, "lastTurn", null)).toEqual({ base: null, files: [] });
    expect(await reviewList(ctx, box.root, "lastTurn", "--output=/tmp/x")).toEqual({ base: null, files: [] });
  });

  it("answers empty outside a repository or outside the project", async () => {
    expect(await reviewList(ctx, box.outside, "uncommitted", null)).toEqual({ base: null, files: [] });
  });

  it("omits secret files", async () => {
    write(path.join(box.root, ".env.local"), "K=1\n");
    write(path.join(box.root, "x.txt"), "x\n");

    expect((await reviewList(ctx, box.root, "uncommitted", null)).files.map(file => file.path)).toEqual(["x.txt"]);
  });
});

describe("reviewDiff and fileDiff", () => {
  it("returns the worktree diff of a tracked file and the cached diff when staged", async () => {
    dirty();
    git(box.root, "add", "a.txt");
    write(path.join(box.root, "a.txt"), "one\ntwo\nthree\nfour\n");

    expect(await reviewDiff(ctx, box.root, "a.txt", { scope: "uncommitted" })).toContain("+four");
    expect(await reviewDiff(ctx, box.root, "a.txt", { scope: "uncommitted", staged: true })).toContain("+three");
  });

  it("synthesises an all-added diff for an untracked file without ever running git on it", async () => {
    dirty();

    const diff = await reviewDiff(ctx, box.root, "fresh.txt", { scope: "uncommitted" });

    expect(diff).toContain("new file mode");
    expect(diff).toContain("@@ -0,0 +1,3 @@");
    expect(diff).toContain("+n2");
  });

  it("diffs the working tree against HEAD for one file, empty for a clean file", async () => {
    dirty();

    expect(await fileDiff(ctx, box.root, "a.txt")).toContain("+three");
    expect(await fileDiff(ctx, box.root, "staged.txt")).toContain("+s1");
    git(box.root, "checkout", "--", "a.txt");
    expect(await fileDiff(ctx, box.root, "a.txt")).toBe("");
  });

  it("diffs the last-turn baseline against the working tree", async () => {
    const base = (await revParse(ctx, box.root, "HEAD")) as string;
    write(path.join(box.root, "a.txt"), "one\ntwo\nthree\n");

    expect(await reviewDiff(ctx, box.root, "a.txt", { baseRef: base, scope: "lastTurn" })).toContain("+three");
  });

  it.each([
    ["an absolute path", "/etc/passwd"],
    ["a .. path", "../outside/secret.txt"],
    ["a secret file", ".env"],
    ["a nested secret", "config/.ssh/id_rsa"],
    ["a NUL", "a\0b"],
    ["a non-string", 42]
  ])("returns nothing for %s", async (_label, file) => {
    write(path.join(box.root, ".env"), "KEY=topsecret\n");
    git(box.root, "add", "-f", ".env");

    expect(await reviewDiff(ctx, box.root, file, { scope: "uncommitted", staged: true })).toBe("");
    expect(await fileDiff(ctx, box.root, file)).toBe("");
  });

  it("never reveals a tracked secret through the ref parameter", async () => {
    write(path.join(box.root, ".env"), "KEY=topsecret\n");
    git(box.root, "add", "-f", ".env");
    git(box.root, "commit", "-q", "-m", "oops");

    expect(await reviewDiff(ctx, box.root, "a.txt", { baseRef: "HEAD:.env", scope: "lastTurn" })).toBe("");
    expect(await revParse(ctx, box.root, "HEAD:.env")).toBeNull();
  });

  it("caps a huge diff", async () => {
    write(path.join(box.root, "a.txt"), "x\n".repeat(700_000));

    const diff = await reviewDiff(ctx, box.root, "a.txt", { scope: "uncommitted" });

    expect(diff.length).toBeLessThan(1024 * 1024 + 100);
    expect(diff).toContain("# diff truncated");
  });
});

describe("revParse", () => {
  it("resolves HEAD and named refs to a sha", async () => {
    expect(await revParse(ctx, box.root, undefined)).toMatch(/^[0-9a-f]{40}$/);
    expect(await revParse(ctx, box.root, "main")).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(["--output=/tmp/x", "-n", "a b", "no-such-ref"])("answers null for the ref %j", async ref => {
    expect(await revParse(ctx, box.root, ref)).toBeNull();
  });

  it("treats an empty ref as HEAD", async () => {
    expect(await revParse(ctx, box.root, "")).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("branches and worktrees", () => {
  it("lists local branches with the trunk flagged and the checked-out one marked", async () => {
    git(box.root, "branch", "topic");

    const branches = await branchList(ctx, box.root);

    expect(branches).toEqual([
      { checkedOut: true, isDefault: true, isRemote: false, name: "main", worktreePath: box.root },
      { checkedOut: false, isDefault: false, isRemote: false, name: "topic", worktreePath: null }
    ]);
  });

  it("lists base branches", async () => {
    git(box.root, "branch", "topic");

    const base = await baseBranchList(ctx, box.root);

    expect(base.map(row => row.name).sort()).toEqual(["main", "topic"]);
    expect(base.find(row => row.name === "main")).toMatchObject({ isDefault: true, isRemote: false });
  });

  it("lists worktrees inside the project and hides ones elsewhere", async () => {
    git(box.root, "worktree", "add", "-q", "-b", "wt", path.join(box.root, ".worktrees", "wt"));
    git(box.root, "worktree", "add", "-q", "-b", "far", path.join(box.outside, "far"));

    const trees = await worktreeList(ctx, box.root);

    expect(trees.map(tree => [path.relative(box.root, tree.path), tree.branch, tree.isMain])).toEqual([
      ["", "main", true],
      [path.join(".worktrees", "wt"), "wt", false]
    ]);
  });

  it("scans only the project itself, ignoring the roots it is given", async () => {
    expect(await scanRepos(ctx)).toEqual([{ label: "project", root: box.root }]);
  });

  it("returns nothing for branches of a path outside the project", async () => {
    expect(await branchList(ctx, box.outside)).toEqual([]);
    expect(await worktreeList(ctx, box.outside)).toEqual([]);
  });
});

describe("safeRelativeFile", () => {
  it("accepts a plain relative path and normalises backslashes", () => {
    expect(safeRelativeFile("src/a.ts")).toBe("src/a.ts");
    expect(safeRelativeFile("src\\a.ts")).toBe("src/a.ts");
  });
});
