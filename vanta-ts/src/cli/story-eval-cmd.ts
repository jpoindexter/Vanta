import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runLiveStory } from "../usecase-eval/live-session.js";
import type { ScriptedScenario, ScriptedStoryReceipt } from "../usecase-eval/multiturn.js";

type StoryEvalDeps = { log?: (line: string) => void; run?: (root: string, scenario: ScriptedScenario) => Promise<ScriptedStoryReceipt> };
const USAGE = "Usage: vanta story-eval --manifest <json> --id <scenario> --out <receipt.json>";

export async function runStoryEvalCommand(repoRoot: string, args: string[], deps: StoryEvalDeps = {}): Promise<number> {
  const log = deps.log ?? console.log;
  try {
    const manifestPath = flag(args, "--manifest");
    const id = flag(args, "--id");
    const out = flag(args, "--out");
    if (!manifestPath || !id || !out) { log(USAGE); return 1; }
    const catalog = JSON.parse(await readFile(resolve(manifestPath), "utf8")) as { scenarios?: unknown[] };
    const raw = catalog.scenarios?.find((item) => isRecord(item) && item.id === id);
    const scenario = parseScenario(raw);
    const receipt = await (deps.run ?? runLiveStory)(repoRoot, scenario);
    const result = toResult(raw as Record<string, unknown>, receipt);
    const outPath = resolve(out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify({ manifest: resolve(manifestPath), results: [result] }, null, 2) + "\n", "utf8");
    log(`story-eval ${receipt.passed ? "PASS" : "FAIL"}: ${id} (${outPath})`);
    return receipt.passed ? 0 : 1;
  } catch (error) {
    log(`story-eval error: ${(error as Error).message}`);
    return 1;
  }
}

function parseScenario(raw: unknown): ScriptedScenario {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.instruction !== "string") throw new Error("scripted scenario not found");
  if (!isRecord(raw.firstTurn) || !Array.isArray(raw.operatorReplies) || raw.operatorReplies.length === 0) throw new Error(`${raw.id} has no scripted turns`);
  return raw as unknown as ScriptedScenario;
}

function toResult(raw: Record<string, unknown>, receipt: ScriptedStoryReceipt): Record<string, unknown> {
  const tools = [...new Set(receipt.turns.flatMap((turn) => turn.tools.map((tool) => tool.name)))];
  const expected = Array.isArray(raw.expectedTools) ? raw.expectedTools.filter((item): item is string => typeof item === "string") : [];
  const reliable = receipt.turns.every((turn) => turn.stoppedReason === "done");
  const guardPassed = receipt.turns.every((turn) => turn.guardPassed);
  return {
    id: receipt.id, sourceStoryId: raw.sourceStoryId, category: raw.category, tier: raw.tier, reliable,
    expectedTools: expected, expectedArtifacts: raw.expectedArtifacts, forbiddenPatterns: raw.forbiddenPatterns,
    observedTools: tools, surfacePassed: raw.expectedToolsMode === "optional" || expected.some((tool) => tools.includes(tool)),
    guardPassed, turns: receipt.turns,
    outcomeVerification: { status: receipt.passed ? "pass" : "fail", method: "multi-turn-contract" },
    outputTail: receipt.turns.at(-1)?.output ?? "",
  };
}

function flag(args: string[], name: string): string | undefined { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
