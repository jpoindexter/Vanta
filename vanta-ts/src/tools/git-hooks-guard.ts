// GIT-HOOKS-WRITE-PROMPT: a git-hooks file is a code-execution-on-commit
// vector — anything written under `.husky/` or `.git/hooks/` runs automatically
// on the matching git operation (commit, push, etc.). Writing one is gated by an
// EXTRA explicit confirmation even inside an otherwise-writable zone. Pure
// detection by PATH SEGMENT (not substring), so `.husky/pre-commit` and
// `repo/.git/hooks/pre-push` match anywhere in the path, while `myhusky/x` or a
// file literally named `hooks.ts` do NOT.

import { sep } from "node:path";

/** Split a path into its segments, tolerating both `/` and the OS separator. */
function segments(path: string): string[] {
  return path.split(/[/\\]/).filter((s) => s.length > 0 && s !== ".");
}

/**
 * True when `path` runs through a git-hooks directory: a `.husky` segment, or a
 * `.git` segment immediately followed by a `hooks` segment. Pure: matches by
 * path SEGMENT in ANY directory, so it catches `.husky/pre-commit`,
 * `./.husky/_/husky.sh`, and `repo/.git/hooks/pre-push`. A normal source file
 * (`src/foo.ts`), a file merely named `hooks.ts`, or a lookalike segment like
 * `myhusky/x` is NOT a git-hooks path and returns false.
 */
export function isGitHooksPath(path: string): boolean {
  const segs = segments(path);
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === ".husky") return true;
    if (segs[i] === ".git" && segs[i + 1] === "hooks") return true;
  }
  return false;
}

/**
 * The confirmation message shown before writing a git-hooks file. Names the
 * run-on-git-operation risk so the human knows why this write is special.
 */
export function gitHooksWarning(path: string): string {
  return (
    `Write git-hooks file ${path} — this is a code-execution-on-commit ` +
    `vector: scripts under .husky/ or .git/hooks/ run automatically on git ` +
    `operations (commit, push). Confirm only if you intend it.`
  );
}

// Reference `sep` so the OS separator is part of the segment intent even when
// the regex split already covers both forms.
export const PATH_SEP = sep;
