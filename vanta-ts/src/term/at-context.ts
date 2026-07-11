import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

// U2 — @-context references. Parses @path refs from user input, resolves
// them to file content, and builds a context block prepended to the message.
// File listing is used to power autocomplete in the TUI palette.

const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist", ".vanta", "__pycache__", ".next", "coverage"]);

/** Extract all @path tokens from a message string. */
export function parseAtRefs(input: string): string[] {
  return [...input.matchAll(/@([\w./\-]+)/g)].map((m) => m[1]!);
}

/**
 * Extract the partial path the user is currently typing after the last `@`.
 * Returns null when there is no active @-ref being typed (e.g. cursor is after
 * a space that follows a completed @ref, or no @ present).
 */
export function activeAtRef(input: string): string | null {
  const m = input.match(/(?:^|\s)@([^\s]*)$/);
  return m ? m[1]! : null;
}

/** Read each resolved @ref and return a formatted context block. */
export async function buildContextBlock(refs: string[], repoRoot: string): Promise<string> {
  const blocks: string[] = [];
  for (const ref of refs) {
    try {
      const content = await readFile(join(repoRoot, ref), "utf8");
      blocks.push(`<file path="${ref}">\n${content}\n</file>`);
    } catch {
      // Skip unreadable / nonexistent files
    }
  }
  return blocks.join("\n\n");
}

/**
 * Parse a .gitignore body into a simple matcher (pure). Supports the common
 * cases the @file picker needs — exact names, `dir/`, and `*` glob segments —
 * matched against a repo-relative POSIX path or any of its ancestor segments.
 * Negations (`!`) and full gitignore semantics are intentionally out of scope.
 */
export function parseGitignore(body: string): (relPath: string) => boolean {
  const patterns = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => l.replace(/\/$/, "").replace(/^\//, ""));
  const toRe = (p: string): RegExp =>
    new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
  const res = patterns.map(toRe);
  return (relPath: string): boolean => {
    const parts = relPath.split("/");
    // A path is ignored if any pattern matches the full path or any segment.
    return res.some((re) => re.test(relPath) || parts.some((seg) => re.test(seg)));
  };
}

async function loadGitignore(repoRoot: string): Promise<(relPath: string) => boolean> {
  try {
    return parseGitignore(await readFile(join(repoRoot, ".gitignore"), "utf8"));
  } catch {
    return () => false; // No .gitignore (or unreadable) → nothing ignored.
  }
}

/**
 * Recursively list files in repoRoot up to maxDepth, skipping build/vendor dirs.
 * `respectGitignore` (default false → today's unfiltered behavior) excludes
 * paths matched by the repo's .gitignore; consumers pass `shouldRespectGitignore`.
 */
export async function listRepoFiles(
  repoRoot: string,
  maxDepth = 3,
  respectGitignore = false,
): Promise<string[]> {
  const files: string[] = [];
  const isIgnored = respectGitignore ? await loadGitignore(repoRoot) : () => false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      const rel = relative(repoRoot, full);
      if (isIgnored(rel)) continue;
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        files.push(rel);
      }
    }
  }

  await walk(repoRoot, 0);
  return files;
}
