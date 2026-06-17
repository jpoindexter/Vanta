import { SafetyClient } from "../safety-client.js";
import type { Goal, Verdict } from "../types.js";

// The KernelClient PORT — the TS-side surface of the Rust safety kernel. Consumers
// type against this interface, never the concrete SafetyClient; construction
// funnels through createKernelClient (the one value-import site). The Rust kernel
// itself stays the fixed boundary — this ports only the client. A different
// transport (IPC, in-process, stub) drops in as one adapter behind this factory.
// Enforced by the `kernel-client-port` fitness rule.

export type KernelClient = {
  status(): Promise<boolean>;
  assess(action: string): Promise<Verdict>;
  getGoals(): Promise<Goal[]>;
  addGoal(text: string): Promise<boolean>;
  completeGoal(id: number): Promise<boolean>;
  getApprovals(): Promise<unknown[]>;
  proposeApproval(action: string): Promise<number | null>;
  approve(id: number): Promise<void>;
  deny(id: number): Promise<void>;
  logEvent(event: string): Promise<void>;
};

/** Build the default kernel client (HTTP adapter → the Rust sidecar). */
export function createKernelClient(baseUrl: string): KernelClient {
  return new SafetyClient(baseUrl);
}
