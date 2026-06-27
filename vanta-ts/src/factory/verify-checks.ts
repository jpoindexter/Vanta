import type { VerifyResult } from "./types.js";

// Leaf helpers for the verify chain: pure size/classify checks + the I/O
// subprocess runners. Imports ONLY node builtins + types — no import from
// verifier.ts, so there is no cycle. verifier.ts imports these back and uses
// them in its VerifyCheck chain (behavior unchanged).

// --- Pure helpers (exported for testing) ---

/** Split touched files into new test files vs everything else. */
export function classifyTouchedFiles(
  touched: string[],
  preExisting: Set<string>,
): { newTestFiles: string[]; otherFiles: string[] } {
  const newTestFiles: string[] = [];
  const otherFiles: string[] = [];
  for (const f of touched) {
    if (f.endsWith(".test.ts") && !preExisting.has(f)) newTestFiles.push(f);
    else otherFiles.push(f);
  }
  return { newTestFiles, otherFiles };
}

/**
 * Hard gate: every NEW non-test source file must be ≤ `limit` lines.
 * Applies to new files only — bug fixes to pre-existing large files are safe.
 */
export async function checkNewFilesUnderLineLimit(
  newSourceFiles: string[],
  limit = 300,
): Promise<VerifyResult> {
  const { readFile } = await import("node:fs/promises");
  for (const f of newSourceFiles) {
    const content = await readFile(f, "utf8").catch(() => "");
    const lines = content.trimEnd().split("\n").length;
    if (lines > limit) {
      const base = f.split("/").at(-1) ?? f;
      return { ok: false, reason: `${base} has ${lines} lines (limit ${limit}) — split into smaller units` };
    }
  }
  return { ok: true };
}

// --- I/O: subprocess-driven checks ---

/** List git-tracked files at HEAD (before the cycle's changes). */
export async function listPreExistingFiles(root: string): Promise<Set<string>> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", ["ls-files"], { cwd: root });
  return new Set(stdout.trim().split("\n").filter(Boolean));
}

/** Run specific test files (or all tests if empty); returns number of failed tests. */
export async function runTestFiles(tsRoot: string, testFiles: string[]): Promise<number> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  type VOut = { numFailedTests: number };
  const args = ["vitest", "run", "--reporter=json", "--outputFile=/dev/stdout", ...testFiles];
  try {
    const { stdout } = await promisify(execFile)("npx", args, { cwd: tsRoot, timeout: 120_000 });
    return (JSON.parse(stdout) as VOut).numFailedTests ?? 0;
  } catch (err) {
    const e = err as { stdout?: string };
    if (e.stdout) {
      try { return (JSON.parse(e.stdout) as VOut).numFailedTests ?? 1; } catch { /* fall through */ }
    }
    return 1;
  }
}

export async function promisifiedExecFile() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return promisify(execFile);
}
