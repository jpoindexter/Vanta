import { describe, expect, it } from "vitest";

import { allAddedDiff, countLines, parseBranches, parseNumstat, parseStatus, parseWorktrees } from "./git-parse";

const nul = (...records: string[]) => `${records.join("\0")}\0`;

describe("parseStatus", () => {
  it("reads the branch header and every kind of entry", () => {
    const out = nul(
      "# branch.oid abc",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 M. N... 100644 100644 100644 h1 h2 src/staged.ts",
      "1 .M N... 100644 100644 100644 h1 h2 src/edited file.ts",
      "2 R. N... 100644 100644 100644 h1 h2 R100 new name.ts",
      "old name.ts",
      "u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict.ts",
      "? notes.md"
    );

    const status = parseStatus(out);

    expect(status).toMatchObject({ ahead: 2, behind: 1, branch: "main", detached: false });
    expect(status.entries.map(entry => [entry.path, entry.index, entry.worktree, entry.untracked, entry.conflicted])).toEqual([
      ["src/staged.ts", "M", ".", false, false],
      ["src/edited file.ts", ".", "M", false, false],
      ["new name.ts", "R", ".", false, false],
      ["conflict.ts", "U", "U", false, true],
      ["notes.md", ".", ".", true, false]
    ]);
  });

  it("marks a detached HEAD and leaves the branch null", () => {
    expect(parseStatus(nul("# branch.head (detached)"))).toMatchObject({ branch: null, detached: true });
  });

  it("is empty for empty output", () => {
    expect(parseStatus("").entries).toEqual([]);
  });
});

describe("parseNumstat", () => {
  it("reads counts, binary rows and renames", () => {
    const out = `3\t1\tsrc/a.ts\0-\t-\timage.png\0` + `5\t0\t\0old.ts\0new.ts\0`;

    expect(parseNumstat(out)).toEqual([
      { added: 3, path: "src/a.ts", removed: 1 },
      { added: 0, path: "image.png", removed: 0 },
      { added: 5, path: "new.ts", removed: 0 }
    ]);
  });
});

describe("parseBranches", () => {
  it("separates local and remote branches and drops origin/HEAD", () => {
    const out = [
      "refs/heads/main\t*\t/work/repo",
      "refs/heads/feature\t \t/work/repo/.worktrees/feature",
      "refs/heads/idle\t \t",
      "refs/remotes/origin/HEAD\t \t",
      "refs/remotes/origin/main\t \t",
      "refs/remotes/origin/other\t \t"
    ].join("\n");

    expect(parseBranches(out)).toEqual([
      { checkedOut: true, current: true, name: "main", remote: false, worktreePath: "/work/repo" },
      { checkedOut: true, current: false, name: "feature", remote: false, worktreePath: "/work/repo/.worktrees/feature" },
      { checkedOut: false, current: false, name: "idle", remote: false, worktreePath: null },
      { checkedOut: false, current: false, name: "origin/main", remote: true, worktreePath: null },
      { checkedOut: false, current: false, name: "origin/other", remote: true, worktreePath: null }
    ]);
  });
});

describe("parseWorktrees", () => {
  it("marks the first block as the main checkout and reads detached and locked flags", () => {
    const out = "worktree /r\nHEAD abc\nbranch refs/heads/main\n\nworktree /r/.wt/x\nHEAD def\ndetached\nlocked reason\n";

    expect(parseWorktrees(out)).toEqual([
      { branch: "main", detached: false, isMain: true, locked: false, path: "/r" },
      { branch: null, detached: true, isMain: false, locked: true, path: "/r/.wt/x" }
    ]);
  });
});

describe("allAddedDiff and countLines", () => {
  it("renders a new file as an all-added unified diff", () => {
    expect(allAddedDiff("a.txt", "x\ny\n")).toBe(
      "diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n"
    );
  });

  it("flags a missing final newline", () => {
    expect(allAddedDiff("a.txt", "x")).toContain("\\ No newline at end of file");
  });

  it("renders an empty new file as a header only", () => {
    expect(allAddedDiff("e.txt", "")).not.toContain("@@");
  });

  it.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2]
  ])("counts the lines of %j as %i", (text, lines) => {
    expect(countLines(text)).toBe(lines);
  });
});
