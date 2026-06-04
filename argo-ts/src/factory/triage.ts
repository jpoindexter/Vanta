import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkItem } from "./types.js";

// --- Pure parsers (all exported for testing) ---

type VitestJson = {
  numFailedTests: number;
  testResults: Array<{
    testFilePath: string;
    status: string;
    assertionResults: Array<{ fullName: string; status: string; failureMessages: string[] }>;
  }>;
};

export function parseVitestOutput(json: string): WorkItem | null {
  let parsed: VitestJson;
  try {
    parsed = JSON.parse(json) as VitestJson;
  } catch {
    return null;
  }
  if (!parsed.numFailedTests) return null;
  const first = parsed.testResults.find((r) => r.status === "failed");
  if (!first) return null;
  const firstFail = first.assertionResults.find((a) => a.status === "failed");
  return {
    category: "test-failure",
    description: `Failing test in ${first.testFilePath}`,
    hint: firstFail?.fullName ?? first.testFilePath,
    targetFile: first.testFilePath,
  };
}

export function parseTscOutput(stderr: string): WorkItem | null {
  if (!stderr.trim()) return null;
  const first = stderr.trim().split("\n")[0] ?? "";
  const fileMatch = first.match(/^([^(]+)\(\d+,\d+\)/);
  return {
    category: "type-error",
    description: `TypeScript error: ${first.slice(0, 120)}`,
    hint: first,
    targetFile: fileMatch?.[1]?.trim(),
  };
}

export function parseRoadmapItem(content: string): WorkItem | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^- \[ \]/.test(line)) {
      const description = line.replace(/^- \[ \]\s*/, "").trim();
      // FAC-CLOSE: extract roadmap JSON ID from bold text like **FAC-STALL**
      const idMatch = description.match(/\*\*([A-Z][A-Z0-9-]+)\*\*/);
      const roadmapId = idMatch?.[1];
      return { category: "roadmap", description, sourceLine: i + 1, roadmapId };
    }
  }
  return null;
}

export function parseParkedItem(content: string): WorkItem | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // ## section headers are parked ideas (skip the top-level # Parked header)
    if (/^## /.test(line)) {
      const description = line.replace(/^## /, "").trim();
      return { category: "parked", description, sourceLine: i + 1 };
    }
  }
  return null;
}

/** Select the highest-priority work item from pre-loaded artifact strings. */
export function selectWorkItem(inputs: {
  vitestJson: string;
  tscStderr: string;
  roadmap: string;
  parked: string;
}): WorkItem | null {
  return (
    parseVitestOutput(inputs.vitestJson) ??
    parseTscOutput(inputs.tscStderr) ??
    parseRoadmapItem(inputs.roadmap) ??
    parseParkedItem(inputs.parked) ??
    null
  );
}

// --- I/O wrapper called by run.ts ---

export async function triage(root: string): Promise<WorkItem | null> {
  const tsRoot = join(root, "argo-ts");

  const vitestJson = await runVitest(tsRoot);
  const tscStderr = await runTsc(tsRoot);
  const roadmap = await readFile(join(root, "ROADMAP.md"), "utf8").catch(() => "");
  const parked = await readFile(join(root, "PARKED.md"), "utf8").catch(() => "");

  return selectWorkItem({ vitestJson, tscStderr, roadmap, parked });
}

async function runVitest(tsRoot: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    const { stdout } = await promisify(execFile)(
      "npx",
      ["vitest", "run", "--reporter=json", "--outputFile=/dev/stdout"],
      { cwd: tsRoot, timeout: 120_000 },
    );
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string };
    return e.stdout ?? JSON.stringify({ numFailedTests: 0, testResults: [] });
  }
}

async function runTsc(tsRoot: string): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  try {
    await promisify(execFile)("npx", ["tsc", "--noEmit"], { cwd: tsRoot, timeout: 60_000 });
    return "";
  } catch (err) {
    return (err as { stderr?: string; stdout?: string }).stderr ?? (err as Error).message;
  }
}
