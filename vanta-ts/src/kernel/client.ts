import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { SafetyClient } from "../safety-client.js";
import type { Goal, Verdict } from "../types.js";
import { profileKernelState } from "./profile-state.js";

function readProfileToken(directory: string): string {
  const file = join(directory, "api-token");
  if (!lstatSync(file).isFile() || realpathSync(file) !== file) throw new Error("The profile kernel token is not private state.");
  const token = readFileSync(file, "utf8").trim();
  if (!token) throw new Error("The profile kernel token is unavailable.");
  return token;
}

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

/** Read the per-install kernel API token (0600). Walks up from VANTA_ROOT/cwd to the
 * nearest ancestor holding `.vanta/api-token` (the client's cwd often differs from the
 * kernel's root — e.g. tests run in vanta-ts while the kernel is rooted at the repo).
 * Undefined if not found — the client then sends no token (older kernel won't require it). */
function readApiToken(root?: string): string | undefined {
  const scoped = profileKernelState(root ?? process.env.VANTA_ROOT ?? process.cwd());
  if (scoped) return readProfileToken(scoped.directory);
  let dir = root ?? process.env.VANTA_ROOT ?? process.cwd();
  for (let i = 0; i < 20; i++) {
    try {
      const t = readFileSync(join(dir, ".vanta", "api-token"), "utf8").trim();
      if (t) return t;
    } catch {
      // not here — keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/** Build the default kernel client (HTTP adapter → the Rust sidecar). */
export function createKernelClient(baseUrl: string, root?: string): KernelClient {
  return new SafetyClient(baseUrl, readApiToken(root));
}

/** Authenticate a bounded kernel endpoint using the same project/profile authority as the port. */
export function kernelAuthHeaders(root?: string): Record<string, string> {
  const token = readApiToken(root);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
