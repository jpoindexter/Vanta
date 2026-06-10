import { describe, it, expect } from "vitest";
import { destructiveWarning } from "./destructive-warn.js";

describe("destructiveWarning", () => {
  it("warns on git reset --hard", () => {
    expect(destructiveWarning("git reset --hard")).toContain("discards uncommitted");
    expect(destructiveWarning("git reset --hard HEAD~3")).toContain("discards uncommitted");
  });

  it("warns on force-push but NOT --force-with-lease", () => {
    expect(destructiveWarning("git push --force origin main")).toContain("force-push");
    expect(destructiveWarning("git push -f")).toContain("force-push");
    expect(destructiveWarning("git push --force-with-lease origin main")).toBeNull();
  });

  it("warns on git clean -f variants but not a dry run", () => {
    expect(destructiveWarning("git clean -fd")).toContain("untracked");
    expect(destructiveWarning("git clean -df")).toContain("untracked");
    expect(destructiveWarning("git clean -n")).toBeNull();
  });

  it("warns when checkout discards working-tree changes", () => {
    expect(destructiveWarning("git checkout .")).toContain("discards uncommitted");
    expect(destructiveWarning("git checkout -- .")).toContain("discards uncommitted");
    expect(destructiveWarning("git checkout -f")).toContain("discards uncommitted");
    expect(destructiveWarning("git checkout main")).toBeNull();
  });

  it("warns on branch -D and stash drop/clear", () => {
    expect(destructiveWarning("git branch -D feature")).toContain("force-deletes");
    expect(destructiveWarning("git stash drop")).toContain("stashed changes");
    expect(destructiveWarning("git stash clear")).toContain("stashed changes");
  });

  it("stays silent for safe commands", () => {
    for (const c of ["git status", "git push origin main", "git checkout -b feat", "ls -la", "git reset --soft HEAD~1"]) {
      expect(destructiveWarning(c)).toBeNull();
    }
  });
});
