import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { analyzeSource, formatViolation, LIMITS, type Violation } from "./size.js";

// `vanta lint` — run the CODE-SIZE-GATE over a set of TS/TSX files. Test files
// and .d.ts are exempt (tests legitimately run long). Targets: explicit paths,
// `--staged` (git index), or the default = all git-tracked .ts/.tsx.

async function git(root: string, args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("git", ["-C", root, ...args]);
  return stdout;
}

const isLintable = (f: string): boolean => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f) && !/\.test\.tsx?$/.test(f);

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

/** CLI entry. Prints violations; returns an exit code (0 clean, 1 violations/missing). */
export async function runLint(root: string, argv: string[]): Promise<number> {
  const files = await resolveTargets(root, argv);
  const { violations, analyzed, missing } = await lintFiles(files);
  for (const m of missing) console.log(`  ⚠ could not read ${m}`);
  if (!violations.length) {
    if (analyzed > 0) console.log(`  ✓ ${analyzed} file(s) within limits (file ≤${LIMITS.file}, fn ≤${LIMITS.func}, params ≤${LIMITS.params}, complexity ≤${LIMITS.complexity})`);
    else if (!missing.length) console.log("  (no TS/TSX files to lint)");
    return missing.length ? 1 : 0;
  }
  console.log(`  ${violations.length} size violation(s) across ${analyzed} file(s):`);
  for (const v of violations) console.log(formatViolation(v));
  return 1;
}
