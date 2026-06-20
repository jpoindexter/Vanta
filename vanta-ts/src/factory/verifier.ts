import { join } from "node:path";
import type { SliceArtifact, VerifyResult, VerifyOpts, VerifyCheck, VerifyCheckCtx } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";
import { checkIntentSatisfied } from "./intent-judge.js";
import { generateHoldout, validateAgainstHoldout } from "./holdout.js";

export type { VerifyOpts } from "./types.js";

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
      (s.startsWith("vanta-ts/src/factory/") && s.endsWith(".ts")) ||
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

async function promisifiedExecFile() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return promisify(execFile);
}

// --- The verify chain (PORT-FACTORY-DEPS) ----------------------------------
// Each gate is a registered VerifyCheck; `verify` runs them in order and returns
// the first failure. Order + short-circuit are unchanged from the original
// hardcoded sequence, so default behavior is identical — but a check can now be
// added/removed/reordered without editing the orchestrator.

const protectedPathsCheck: VerifyCheck = {
  name: "protected-paths",
  run: async ({ artifact, root }) => checkNoProtectedPaths(artifact.touchedFiles, root),
};

const noExistingTestModifiedCheck: VerifyCheck = {
  name: "no-existing-test-modified",
  run: async ({ artifact, preExisting }) => checkNoExistingTestModified(artifact.touchedFiles, preExisting),
};

const newFilesSizeCheck: VerifyCheck = {
  name: "new-files-size",
  run: async ({ artifact, preExisting, root }) => {
    const newSourceFiles = artifact.touchedFiles
      .filter((f) => !preExisting.has(f) && f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(root, f));
    return checkNewFilesUnderLineLimit(newSourceFiles);
  },
};

// New tests must FAIL against pre-change code (else they exercise nothing).
const newTestsFailOnPreChangeCheck: VerifyCheck = {
  name: "new-tests-fail-on-prechange",
  run: async ({ artifact, preExisting, root, tsRoot }) => {
    const { newTestFiles } = classifyTouchedFiles(artifact.touchedFiles, preExisting);
    if (newTestFiles.length === 0) return { ok: true };
    const exec = await promisifiedExecFile();
    await exec("git", ["stash"], { cwd: root });
    try {
      const failCount = await runTestFiles(tsRoot, newTestFiles);
      if (failCount === 0) return { ok: false, reason: "new test(s) pass on pre-change code — test exercises nothing" };
      return { ok: true };
    } finally {
      await exec("git", ["stash", "pop"], { cwd: root }).catch(() => {});
    }
  },
};

const fullSuiteCheck: VerifyCheck = {
  name: "full-suite",
  run: async ({ tsRoot }) => {
    const fullFails = await runTestFiles(tsRoot, []);
    return fullFails > 0 ? { ok: false, reason: `${fullFails} pre-existing test(s) broken` } : { ok: true };
  },
};

const tscCheck: VerifyCheck = {
  name: "tsc",
  run: async ({ tsRoot }) => {
    const exec = await promisifiedExecFile();
    try {
      await exec("npx", ["tsc", "--noEmit"], { cwd: tsRoot, timeout: 60_000 });
      return { ok: true };
    } catch (err) {
      const msg = ((err as { stderr?: string }).stderr ?? (err as Error).message).split("\n")[0] ?? "";
      return { ok: false, reason: `tsc error: ${msg}` };
    }
  },
};

// Intent-satisfaction judge (subjective — fails OPEN on LLM error; tests/tsc are the hard floor).
const intentJudgeCheck: VerifyCheck = {
  name: "intent-judge",
  run: async ({ artifact, opts }) => {
    if (!opts?.workItem) return { ok: true };
    let judgeProvider = opts.provider;
    if (!judgeProvider) {
      const { resolveProvider } = await import("../providers/index.js");
      judgeProvider = resolveProvider(process.env);
    }
    return checkIntentSatisfied(opts.workItem, artifact.touchedFiles, judgeProvider);
  },
};

/** Author-separation provider for the holdout gate: a DIFFERENT model than the
 * executor when one is configured, else the active provider (degraded). */
async function resolveHoldoutProvider(override?: LLMProvider): Promise<LLMProvider> {
  if (override) return override;
  const { resolveProvider } = await import("../providers/index.js");
  const holdoutModel = process.env.VANTA_FACTORY_HOLDOUT_MODEL ?? process.env.VANTA_MODEL_EXPENSIVE;
  if (holdoutModel) return resolveProvider({ ...process.env, VANTA_MODEL: holdoutModel });
  return resolveProvider(process.env);
}

// FAC-HOLDOUT: armed-only (VANTA_FACTORY_HOLDOUT). A separate provider authors
// acceptance criteria and reviews the slice against them. OFF by default → no
// behavior change; when armed, a failing review fails the gate.
const holdoutCheck: VerifyCheck = {
  name: "holdout",
  run: async ({ artifact, opts }) => {
    if (!process.env.VANTA_FACTORY_HOLDOUT || !opts?.workItem) return { ok: true };
    const provider = await resolveHoldoutProvider(opts.provider);
    const criteria = await generateHoldout(opts.workItem, provider);
    if (!criteria) return { ok: true }; // best-effort: couldn't author criteria → don't block
    const summary = `Work item: ${opts.workItem.description}\nTouched files:\n${artifact.touchedFiles.join("\n")}`;
    const result = await validateAgainstHoldout(criteria, summary, provider);
    return result.passes ? { ok: true } : { ok: false, reason: `holdout: ${result.failing.join("; ")} — ${result.note}` };
  },
};

/** The verify gate as an ordered, registered check chain. Extend by adding a
 * VerifyCheck here — the orchestrator (run.ts) never changes. */
export function buildVerifyChecks(): VerifyCheck[] {
  return [
    protectedPathsCheck,
    noExistingTestModifiedCheck,
    newFilesSizeCheck,
    newTestsFailOnPreChangeCheck,
    fullSuiteCheck,
    tscCheck,
    intentJudgeCheck,
    holdoutCheck,
  ];
}

/**
 * Run the full verification trust gate as the registered check chain, returning
 * the first failure (or {ok:true} when all pass). Behavior is identical to the
 * prior hardcoded sequence; the chain just makes it swappable/testable.
 */
export async function verify(root: string, artifact: SliceArtifact, preExisting: Set<string>, opts?: VerifyOpts): Promise<VerifyResult> {
  const ctx: VerifyCheckCtx = { root, tsRoot: join(root, "vanta-ts"), artifact, preExisting, opts };
  for (const check of buildVerifyChecks()) {
    const result = await check.run(ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}
