import type { WakeContext } from "../loop/types.js";

export type RunTaskIdentity = {
  sessionId: string;
  usageAgent: "messaging" | "jobs";
  usageTaskId: string | undefined;
};

export function runTaskIdentity(wake?: WakeContext): RunTaskIdentity {
  return wake
    ? { sessionId: `jobs:${wake.goal_id}`, usageAgent: "jobs", usageTaskId: wake.goal_id }
    : { sessionId: "messaging", usageAgent: "messaging", usageTaskId: undefined };
}
