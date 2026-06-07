import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
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

/** Resolve which files to lint from argv. */
export async function resolveTargets(root: string, argv: string[]): Promise<string[]> {
  const explicit = argv.filter((a) => !a.startsWith("-"));
  let rel: string[];
  if (explicit.length) rel = explicit;
  else if (argv.includes("--staged")) rel = (await git(root, ["diff", "--cached", "--name-only", "--diff-filter=ACM"]).catch(() => "")).split("\n");
  else rel = (await git(root, ["ls-files", "*.ts", "*.tsx"]).catch(() => "")).split("\n");
  return rel.map((s) => s.trim()).filter(isLintable).map((f) => (isAbsolute(f) ? f : join(root, f)));
}

/** Analyze a list of files. Pure-ish (reads each file). */
export async function lintFiles(files: string[]): Promise<Violation[]> {
  const out: Violation[] = [];
  for (const f of files) {
    const content = await readFile(f, "utf8").catch(() => null);
    if (content !== null) out.push(...analyzeSource(f, content));
  }
  return out;
}

/** CLI entry. Prints violations; returns an exit code (0 clean, 1 violations). */
export async function runLint(root: string, argv: string[]): Promise<number> {
  const files = await resolveTargets(root, argv);
  const violations = await lintFiles(files);
  if (!violations.length) {
    console.log(`  ✓ ${files.length} file(s) within limits (file ≤${LIMITS.file}, fn ≤${LIMITS.func}, params ≤${LIMITS.params}, complexity ≤${LIMITS.complexity})`);
    return 0;
  }
  console.log(`  ${violations.length} size violation(s):`);
  for (const v of violations) console.log(formatViolation(v));
  return 1;
}
