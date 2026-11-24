import { gitExecFile } from "../git/process.js";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { BASELINE_FILE, buildBaseline, isDataFile, readBaseline, worsened, writeBaseline } from "./baseline.js";
import { analyzeSource, formatViolation, LIMITS, type Violation } from "./size.js";

// `vanta lint` — run the CODE-SIZE-GATE over a set of TS/TSX files. Test files,
// .d.ts, locale tables and generated code are exempt (tests legitimately run long;
// the rest is data). Targets: explicit paths, `--staged` (git index), or the
// default = all git-tracked .ts/.tsx.
// `--baseline[=path]` blocks only violations that are new or worse than the recorded
// baseline (default <repo>/.size-baseline.json); `--staged` does the same whenever that file
// exists (`--strict` opts out); `--write-baseline` records the current ones.

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await gitExecFile("git", ["-C", root, ...args]);
  return stdout;
}

const isLintable = (f: string): boolean => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f) && !/\.test\.tsx?$/.test(f) && !isDataFile(f);

/** Resolve which files to lint from argv. Explicit paths resolve against the
 *  caller's cwd (what the user typed); git-derived paths against the repo root. */
export async function resolveTargets(root: string, argv: string[]): Promise<string[]> {
  const explicit = argv.filter((a) => !a.startsWith("-"));
  if (explicit.length) {
    return explicit.filter(isLintable).map((f) => (isAbsolute(f) ? f : resolve(process.cwd(), f)));
  }
  const rel = argv.includes("--staged")
    ? (await git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACM"]).catch(() => "")).split("\n")
    : (await git(root, ["ls-files", "*.ts", "*.tsx"]).catch(() => "")).split("\n");
  return rel.map((s) => s.trim()).filter(isLintable).map((f) => (isAbsolute(f) ? f : join(root, f)));
}

/** Analyze files. Reports violations + how many were actually read vs missing,
 *  so an unreadable path can never masquerade as a clean pass. */
export async function lintFiles(files: string[]): Promise<{ violations: Violation[]; analyzed: number; missing: string[] }> {
  const violations: Violation[] = [];
  const missing: string[] = [];
  let analyzed = 0;
  for (const f of files) {
    const content = await readFile(f, "utf8").catch(() => null);
    if (content === null) { missing.push(f); continue; }
    analyzed++;
    violations.push(...analyzeSource(f, content));
  }
  return { violations, analyzed, missing };
}

const BASELINE_FLAG = /^--baseline(?:=(.+))?$/;

/**
 * The baseline path to use, and whether the caller asked for it. `--baseline[=path]` asks for it; a
 * `--staged` run (the commit hook) uses the repo baseline when one exists, unless `--strict` is given.
 */
function baselineChoice(root: string, argv: string[]): { path: string; asked: boolean } | null {
  for (const arg of argv) {
    const match = BASELINE_FLAG.exec(arg);
    if (match) return { path: match[1] ? resolve(match[1]) : join(root, BASELINE_FILE), asked: true };
  }
  if (argv.includes("--staged") && !argv.includes("--strict")) return { path: join(root, BASELINE_FILE), asked: false };
  return null;
}

/** With a readable baseline, keep only the violations that are new or worse; otherwise stay strict. */
async function applyBaseline(root: string, argv: string[], all: Violation[]): Promise<{ violations: Violation[]; baselined: boolean }> {
  const choice = baselineChoice(root, argv);
  if (!choice) return { violations: all, baselined: false };
  const baseline = await readBaseline(choice.path);
  if (!baseline) {
    if (choice.asked) console.log(`  ⚠ no readable baseline at ${choice.path}; checking strictly`);
    return { violations: all, baselined: false };
  }
  return { violations: worsened(root, all, baseline), baselined: true };
}

async function recordBaseline(root: string, argv: string[], all: Violation[]): Promise<number> {
  const path = baselineChoice(root, argv)?.path ?? join(root, BASELINE_FILE);
  const baseline = buildBaseline(root, all);
  await writeBaseline(path, baseline);
  console.log(`  recorded ${all.length} existing violation(s) in ${Object.keys(baseline).length} file(s) → ${path}`);
  return 0;
}

/** CLI entry. Prints violations; returns an exit code (0 clean, 1 violations/missing). */
export async function runLint(root: string, argv: string[]): Promise<number> {
  const files = await resolveTargets(root, argv);
  const { violations: all, analyzed, missing } = await lintFiles(files);
  for (const m of missing) console.log(`  ⚠ could not read ${m}`);
  if (argv.includes("--write-baseline")) return recordBaseline(root, argv, all);
  const { violations, baselined } = await applyBaseline(root, argv, all);
  if (!violations.length) {
    if (baselined && all.length) console.log(`  ✓ ${analyzed} file(s): no new or worse violations than the baseline (${all.length} existing)`);
    else if (analyzed > 0) console.log(`  ✓ ${analyzed} file(s) within limits (file ≤${LIMITS.file}, fn ≤${LIMITS.func}, params ≤${LIMITS.params}, complexity ≤${LIMITS.complexity})`);
    else if (!missing.length) console.log("  (no TS/TSX files to lint)");
    return missing.length ? 1 : 0;
  }
  console.log(`  ${violations.length} size violation(s) across ${analyzed} file(s):`);
  for (const v of violations) console.log(formatViolation(v));
  return 1;
}
