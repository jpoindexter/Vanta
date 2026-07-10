import { join } from "node:path";
import { createKernelClient } from "../kernel/client.js";
import { ensureKernel } from "../kernel-launcher.js";
import { kernelBinaryPath } from "../kernel/path.js";
import { readGoalDeps } from "../goals/deps.js";
import {
  createGoalSentinel,
  formatSentinel,
  formatSentinels,
  loadSentinels,
  retireSentinel,
  runSentinels,
} from "../goals/sentinel.js";
import { formatGoalLedger } from "../repl/goal-ledger.js";
import type { Goal } from "../types.js";

type GoalsDeps = {
  dataDir?: string;
  getGoals?: () => Promise<Goal[]>;
  log?: (line: string) => void;
  rest?: string[];
};

export async function runGoalsCommand(root: string, deps: GoalsDeps = {}): Promise<number> {
  const dataDir = deps.dataDir ?? join(root, ".vanta");
  if (deps.rest?.[0] === "sentinel") return runSentinelCommand(dataDir, deps.rest.slice(1), deps.log ?? console.log);
  const getGoals = deps.getGoals ?? await liveGoalReader(root);
  const [goals, graph] = await Promise.all([getGoals(), readGoalDeps(dataDir)]);
  (deps.log ?? console.log)(formatGoalLedger(goals, graph.edges));
  return 0;
}

async function liveGoalReader(root: string): Promise<() => Promise<Goal[]>> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: kernelBinaryPath(root), root });
  return () => createKernelClient(baseUrl).getGoals();
}

async function runSentinelCommand(dataDir: string, rest: string[], log: (line: string) => void): Promise<number> {
  const sub = rest[0] ?? "list";
  if (sub === "list" || sub === "show") {
    log(formatSentinels(await loadSentinels(dataDir)));
    return 0;
  }
  if (sub === "run") return runAndPrintSentinels(dataDir, log);
  if (sub === "add") return addSentinel(dataDir, rest.slice(1), log);
  if (sub === "retire") return retireSentinelCommand(dataDir, rest.slice(1), log);
  log("usage: vanta goals sentinel [list|run|add <goal-id> <goal-text> --check <cmd>|retire <id> <note>]");
  return 1;
}

async function runAndPrintSentinels(dataDir: string, log: (line: string) => void): Promise<number> {
  const results = await runSentinels(dataDir);
  if (!results.length) log("standing-goal sentinel: no active checks");
  for (const r of results) log(`${r.status === "pass" ? "pass" : "wake"} ${r.sentinel.id}: ${r.output}`);
  return results.some((r) => r.status === "fail") ? 2 : 0;
}

async function addSentinel(dataDir: string, rest: string[], log: (line: string) => void): Promise<number> {
  const checkIdx = rest.indexOf("--check");
  const goalId = Number(rest[0]);
  const goalText = rest.slice(1, checkIdx === -1 ? undefined : checkIdx).join(" ").trim();
  const command = checkIdx === -1 ? "" : rest.slice(checkIdx + 1).join(" ").trim();
  if (!Number.isInteger(goalId) || !goalText || !command) {
    log("usage: vanta goals sentinel add <goal-id> <goal-text> --check <cmd>");
    return 1;
  }
  log(formatSentinel(await createGoalSentinel(dataDir, { goalId, goalText, command })));
  return 0;
}

async function retireSentinelCommand(dataDir: string, rest: string[], log: (line: string) => void): Promise<number> {
  const [id, ...reasonParts] = rest;
  const reason = reasonParts.join(" ").trim();
  if (!id || !reason) {
    log("usage: vanta goals sentinel retire <id> <note>");
    return 1;
  }
  const retired = await retireSentinel(dataDir, { id, reason });
  if (!retired) {
    log(`sentinel not found or missing retire note: ${id}`);
    return 1;
  }
  log(formatSentinel(retired));
  return 0;
}
