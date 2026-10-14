import { createKernelClient, type KernelClient } from "../kernel/client.js";
import type { Goal } from "../types.js";

const DEFAULT_KERNEL_URL = "http://127.0.0.1:7788";

export type KernelGoalsDeps = {
  env?: NodeJS.ProcessEnv;
  create?: (url: string, root: string) => Pick<KernelClient, "status" | "getGoals">;
};

/**
 * Goals from a kernel that is already running, for the company tick when no chat
 * session has connected yet. Probes first and returns [] when the kernel is down,
 * so this can never start one (a kernel started here would have no owner to reap it).
 */
export async function readRunningKernelGoals(root: string, deps: KernelGoalsDeps = {}): Promise<Goal[]> {
  const url = (deps.env ?? process.env).VANTA_KERNEL_URL ?? DEFAULT_KERNEL_URL;
  const client = (deps.create ?? createKernelClient)(url, root);
  try {
    if (!(await client.status())) return [];
    return await client.getGoals();
  } catch {
    return [];
  }
}
