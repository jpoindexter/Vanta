import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  auditHarnessThickness,
  formatThicknessReport,
  parseThicknessRuns,
  removeCandidateLine,
  thicknessTrend,
  type HarnessSource,
  type ThicknessRun,
} from "../harness/thickness.js";

const SOURCE_PATHS = [
  "SOUL.md",
  "PROGRAM.md",
  "AGENTS.md",
  "CLAUDE.md",
  "vanta-ts/AGENTS.md",
  "vanta-ts/CLAUDE.md",
  "vanta-ts/src/prompt-tiers.ts",
  "vanta-ts/src/prompt.ts",
] as const;

export async function runHarnessThicknessCommand(repoRoot: string, args: string[] = []): Promise<number> {
  if (args[0] === "remove") return removeCandidate(repoRoot, args.slice(1));
  const record = !args.includes("--no-record");
  const limit = Number(value(args, "--limit") ?? 8);
  const sources = await collectHarnessSources(repoRoot);
  const previous = await latestRecordedRun(repoRoot);
  const run = auditHarnessThickness(sources);
  if (record) await appendRun(repoRoot, run);
  console.log(formatThicknessReport(run, thicknessTrend(run, previous), Number.isFinite(limit) ? limit : 8));
  if (record) console.log(`recorded: ${relative(repoRoot, historyPath(repoRoot))}`);
  return 0;
}

export async function collectHarnessSources(repoRoot: string): Promise<HarnessSource[]> {
  const out: HarnessSource[] = [];
  for (const rel of SOURCE_PATHS) {
    const path = join(repoRoot, rel);
    try {
      out.push({ path: rel, text: await readFile(path, "utf8") });
    } catch {
      // Optional context files vary by install. Missing files are not audit failures.
    }
  }
  return out;
}

function historyPath(repoRoot: string): string {
  return join(repoRoot, ".vanta", "harness-thickness.jsonl");
}

async function latestRecordedRun(repoRoot: string): Promise<ThicknessRun | undefined> {
  try {
    const runs = parseThicknessRuns(await readFile(historyPath(repoRoot), "utf8"));
    return runs.at(-1);
  } catch {
    return undefined;
  }
}

async function appendRun(repoRoot: string, run: ThicknessRun): Promise<void> {
  const path = historyPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  let prior = "";
  try {
    prior = await readFile(path, "utf8");
  } catch {}
  await writeFile(path, `${prior}${JSON.stringify(run)}\n`, "utf8");
}

function value(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx === -1 ? undefined : args[idx + 1];
}

async function removeCandidate(repoRoot: string, args: string[]): Promise<number> {
  const target = args[0];
  const expected = value(args, "--expected");
  if (!target || !expected) {
    console.error("usage: vanta harness-thickness remove <file:line> --expected <text>");
    return 1;
  }
  const parsed = parseTarget(target);
  if (!parsed) {
    console.error("invalid target; expected <file:line>");
    return 1;
  }
  const path = resolve(repoRoot, parsed.path);
  const root = resolve(repoRoot);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    console.error("refused: target must stay inside the repo");
    return 1;
  }
  const current = await readFile(path, "utf8");
  const result = removeCandidateLine(current, parsed.line, expected);
  if (!result.ok) {
    console.error(`refused: ${result.error}`);
    return 1;
  }
  await writeFile(path, result.text, "utf8");
  console.log(`removed ${relative(repoRoot, path)}:${parsed.line}`);
  console.log(result.removed.trim());
  return 0;
}

function parseTarget(target: string): { path: string; line: number } | null {
  const idx = target.lastIndexOf(":");
  if (idx <= 0) return null;
  const line = Number(target.slice(idx + 1));
  if (!Number.isInteger(line) || line < 1) return null;
  return { path: target.slice(0, idx), line };
}
