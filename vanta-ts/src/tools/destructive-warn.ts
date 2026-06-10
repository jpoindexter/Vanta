// CC-DESTRUCTIVE-WARN: a curated list of bash/git commands that are allowed to
// run but can silently discard work. We surface an INFORMATIONAL note alongside
// the result — it never blocks or changes approval logic (the kernel/DESTRUCTIVE
// gate handles outright-refused commands like `rm -rf`).

const PATTERNS: Array<{ re: RegExp; note: string }> = [
  { re: /\bgit\s+reset\b[^|;&\n]*--hard\b/, note: "git reset --hard discards uncommitted changes and resets the working tree" },
  { re: /\bgit\s+push\b[^|;&\n]*(--force(?!-with-lease)\b|\s-f\b)/, note: "force-push overwrites remote history — collaborators may lose commits" },
  { re: /\bgit\s+clean\b[^|;&\n]*\s-[a-eg-z]*f/, note: "git clean -f permanently deletes untracked files" },
  { re: /\bgit\s+checkout\b[^|;&\n]*(\s--?\s+\.|\s\.$|\s-f\b|--force\b)/, note: "git checkout discards uncommitted changes to tracked files" },
  { re: /\bgit\s+restore\b[^|;&\n]*(\s\.|--worktree)/, note: "git restore discards uncommitted changes in the working tree" },
  { re: /\bgit\s+branch\s+-D\b/, note: "git branch -D force-deletes a branch even if it has unmerged commits" },
  { re: /\bgit\s+stash\s+(drop|clear)\b/, note: "git stash drop/clear permanently removes stashed changes" },
];

/**
 * Return an informational warning for a destructive-but-allowed command, or null.
 * Pure — unit-tested without running anything.
 */
export function destructiveWarning(command: string): string | null {
  for (const p of PATTERNS) if (p.re.test(command)) return p.note;
  return null;
}
