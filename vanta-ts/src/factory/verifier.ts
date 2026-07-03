import { join } from "node:path";
import { existsSync } from "node:fs";
import type { SliceArtifact, VerifyResult, VerifyOpts, VerifyCheck, VerifyCheckCtx } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";
import { checkIntentSatisfied } from "./intent-judge.js";
import { generateHoldout, validateAgainstHoldout } from "./holdout.js";
import {
  checkNewFilesUnderLineLimit,
  classifyTouchedFiles,
  listPreExistingFiles,
  promisifiedExecFile,
  runTestFiles,
} from "./verify-checks.js";

export type { VerifyOpts } from "./types.js";
// Re-export the leaf check helpers so `./verifier.js` stays their public import
// site (run.ts + run-stages.ts + verifier.test.ts depend on this surface).
export { checkNewFilesUnderLineLimit, classifyTouchedFiles, listPreExistingFiles };

// isProtectedPath + checkNoProtectedPaths MUST stay defined here — they mirror
// the kernel (src/safety.rs:is_protected_path), and factory/CLAUDE.md points at
// verifier.ts:checkNoProtectedPaths. Do not move or alter a condition.

/**
 * True if a (lower-cased) path is kernel-protected. Mirrors `is_protected_path` in `src/safety.rs` —
 * the conditions below MUST stay byte-identical to the kernel (verifier.test.ts guards this mirror).
 */
function isProtectedPath(s: string): boolean {
  return (
    (s.startsWith("src/") && (s.endsWith(".rs") || s.endsWith(".toml") || s.endsWith(".lock"))) ||
    s === "cargo.toml" ||
    s === "cargo.lock" ||
    (s.startsWith("vanta-ts/src/factory/") && s.endsWith(".ts")) ||
    s === "manifesto.md"
  );
}

/** Check that no touched file is a protected path. Mirrors is_protected_path in src/safety.rs. */
export function checkNoProtectedPaths(files: string[], _root: string): VerifyResult {
  for (const f of files) {
    if (isProtectedPath(f.toLowerCase())) {
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

/**
 * CODE-INTEL-FACTORY-WIRING — extract runnable *.test.ts paths (relative to tsRoot) from an
 * affected() report, keeping ONLY files that actually exist. Strips a leading `vanta-ts/` so a
 * repo-root path normalizes to tsRoot-relative; a stale/garbage path is dropped rather than
 * false-failing the slice. Reads existence (best-effort), otherwise pure.
 */
export function affectedTestPaths(report: string, tsRoot: string): string[] {
  const matches = report.match(/[\w./-]+\.test\.tsx?/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const rel = raw.replace(/^vanta-ts\//, "");
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (existsSync(join(tsRoot, rel))) out.push(rel);
  }
  return out;
}

// CODE-INTEL-FACTORY-WIRING — when code intelligence is available, run the tests AFFECTED by the
// changed files first as a fast-fail pre-gate. ADDITIVE + guarded: no provider / unavailable /
// failed lookup / no existing affected test → {ok:true} (no-op), and the full-suite check below
// stays the pass floor. Because affected tests ⊆ the full suite, this can only fast-fail a slice
// the full-suite check would also fail — it never weakens the gate. Removing this entry reverts
// the factory to full-verify with no other impact.
const affectedTestsCheck: VerifyCheck = {
  name: "affected-tests",
  run: async ({ artifact, tsRoot, opts }) => {
    const provider = opts?.codeIntel;
    if (!provider || !(await provider.available())) return { ok: true };
    const res = await provider.affected(artifact.touchedFiles);
    if (!res.ok) return { ok: true };
    const testFiles = affectedTestPaths(res.value, tsRoot);
    if (testFiles.length === 0) return { ok: true };
    const fails = await runTestFiles(tsRoot, testFiles);
    return fails > 0 ? { ok: false, reason: `${fails} affected test(s) failing` } : { ok: true };
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
    affectedTestsCheck,
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
