import { join } from "node:path";
import type { SliceArtifact, VerifyResult, WorkItem } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";
import { checkIntentSatisfied } from "./intent-judge.js";

// --- Pure helpers (all exported for testing) ---

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

/** Check that no touched file is a protected path. Mirrors is_protected_path in src/safety.rs. */
export function checkNoProtectedPaths(files: string[], _root: string): VerifyResult {
  for (const f of files) {
    const s = f.toLowerCase();
    if (
      (s.startsWith("src/") && (s.endsWith(".rs") || s.endsWith(".toml") || s.endsWith(".lock"))) ||
      s === "cargo.toml" ||
      s === "cargo.lock" ||
      (s.startsWith("argo-ts/src/factory/") && s.endsWith(".ts")) ||
      s === "manifesto.md"
    ) {
      return { ok: false, reason: `protected path touched: ${f}` };
    }
  }
  return { ok: true };
}

/** Factory may add tests but must not modify pre-existing test files. */
export function checkNoExistingTestModified(touched: string[], preExisting: Set<string>): VerifyResult {
  for (const f of touched) {
    if (f.endsWith(".test.ts") && preExisting.has(f)) {
      return { ok: false, reason: `existing test file modified: ${f} — requires out-of-band approval` };
    }
  }
  return { ok: true };
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
async function runTestFiles(tsRoot: string, testFiles: string[]): Promise<number> {
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

export type VerifyOpts = {
  workItem?: WorkItem;
  /** Override the LLM judge provider (default: resolved from env when workItem is set). */
  provider?: LLMProvider;
};

/**
 * Run the full verification trust gate:
 * 1. No protected paths touched.
 * 2. No pre-existing test files modified.
 * 3. New source files ≤ 300 lines (born-small gate).
 * 4. New tests fail against pre-change code (git stash / pop).
 * 5. Full prior suite passes.
 * 6. tsc --noEmit clean.
 * 7. LLM intent-satisfaction judge (if workItem provided; fails open on LLM error).
 */
export async function verify(root: string, artifact: SliceArtifact, preExisting: Set<string>, opts?: VerifyOpts): Promise<VerifyResult> {
  const tsRoot = join(root, "argo-ts");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  // 1. Protected paths
  const protectedCheck = checkNoProtectedPaths(artifact.touchedFiles, root);
  if (!protectedCheck.ok) return protectedCheck;

  // 2. Pre-existing tests must not be modified
  const existingTestCheck = checkNoExistingTestModified(artifact.touchedFiles, preExisting);
  if (!existingTestCheck.ok) return existingTestCheck;

  const { newTestFiles } = classifyTouchedFiles(artifact.touchedFiles, preExisting);

  // 3. New source files must be born small (≤ 300 lines)
  const newSourceFiles = artifact.touchedFiles
    .filter((f) => !preExisting.has(f) && f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(root, f));
  const sizeCheck = await checkNewFilesUnderLineLimit(newSourceFiles);
  if (!sizeCheck.ok) return sizeCheck;

  // 3. New tests must FAIL against pre-change code
  if (newTestFiles.length > 0) {
    await exec("git", ["stash"], { cwd: root });
    try {
      const failCount = await runTestFiles(tsRoot, newTestFiles);
      if (failCount === 0) {
        return { ok: false, reason: "new test(s) pass on pre-change code — test exercises nothing" };
      }
    } finally {
      await exec("git", ["stash", "pop"], { cwd: root }).catch(() => {});
    }
  }

  // 4. Full prior suite must pass
  const fullFails = await runTestFiles(tsRoot, []);
  if (fullFails > 0) {
    return { ok: false, reason: `${fullFails} pre-existing test(s) broken` };
  }

  // 5. tsc clean
  try {
    await exec("npx", ["tsc", "--noEmit"], { cwd: tsRoot, timeout: 60_000 });
  } catch (err) {
    const msg = ((err as { stderr?: string }).stderr ?? (err as Error).message).split("\n")[0] ?? "";
    return { ok: false, reason: `tsc error: ${msg}` };
  }

  // 7. Intent-satisfaction judge (subjective — runs last, fails open on LLM errors)
  if (opts?.workItem) {
    let judgeProvider = opts.provider;
    if (!judgeProvider) {
      const { resolveProvider } = await import("../providers/index.js");
      judgeProvider = resolveProvider(process.env);
    }
    const intentResult = await checkIntentSatisfied(opts.workItem, artifact.touchedFiles, judgeProvider);
    if (!intentResult.ok) return intentResult;
  }

  return { ok: true };
}
