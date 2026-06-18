import { join } from "node:path";
import { createKernelClient } from "../kernel/client.js";
import { ensureKernel } from "../kernel-launcher.js";
import { readGoalDeps } from "../goals/deps.js";
import { formatGoalLedger } from "../repl/goal-ledger.js";
import type { Goal } from "../types.js";

type GoalsDeps = {
  dataDir?: string;
  getGoals?: () => Promise<Goal[]>;
  log?: (line: string) => void;
};

export async function runGoalsCommand(root: string, deps: GoalsDeps = {}): Promise<number> {
  const dataDir = deps.dataDir ?? join(root, ".vanta");
  const getGoals = deps.getGoals ?? await liveGoalReader(root);
  const [goals, graph] = await Promise.all([getGoals(), readGoalDeps(dataDir)]);
  (deps.log ?? console.log)(formatGoalLedger(goals, graph.edges));
  return 0;
}

async function liveGoalReader(root: string): Promise<() => Promise<Goal[]>> {
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: join(root, "target", "debug", "vanta-kernel"), root });
  return () => createKernelClient(baseUrl).getGoals();
}
