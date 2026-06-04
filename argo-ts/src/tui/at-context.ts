import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

// U2 — @-context references. Parses @path refs from user input, resolves
// them to file content, and builds a context block prepended to the message.
// File listing is used to power autocomplete in the TUI palette.

const SKIP_DIRS = new Set([".git", "node_modules", "target", "dist", ".argo", "__pycache__", ".next", "coverage"]);

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
  const m = input.match(/@([\w./\-]*)$/);
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

/** Recursively list files in repoRoot up to maxDepth, skipping build/vendor dirs. */
export async function listRepoFiles(repoRoot: string, maxDepth = 3): Promise<string[]> {
  const files: string[] = [];

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
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        files.push(relative(repoRoot, full));
      }
    }
  }

  await walk(repoRoot, 0);
  return files;
}
