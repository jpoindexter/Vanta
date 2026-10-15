import { resolvePermissionMode } from "../modes/permission-mode.js";
import { loadRules } from "../permissions/store.js";
import type { KernelClient } from "../kernel/client.js";
import type { EffectGateContext } from "../effects/execute-effect.js";
import { bootstrapKernel } from "../session/bootstrap-kernel.js";
import { createLaunchGate, type LaunchGate } from "./launch-gate.js";

// The launch gate for hosts with no UI (`vanta heartbeat`, `vanta company tick`).
// No approval card can be shown, so a launch proceeds only when the owner has
// already saved an "Always" rule for call_agent in this project (and the CLI is
// not self-approving, which always needs a live card). The kernel still assesses
// every launch, and the effect gate inside runExternalAgent still applies.

export function createHeadlessLaunchGate(root: string, env: NodeJS.ProcessEnv, kernel?: EffectGateContext["kernel"]): LaunchGate {
  let pending: Promise<KernelClient> | undefined;
  const client = (): Promise<EffectGateContext["kernel"]> => (kernel ? Promise.resolve(kernel) : (pending ??= bootstrapKernel(root)));
  return {
    authorize: async (request) => {
      const live = await client().catch((error: unknown) => error);
      if (live instanceof Error) return { ok: false, error: `blocked: safety kernel unavailable (${live.message}). Start Vanta once to launch it.` };
      const k = live as EffectGateContext["kernel"];
      return createLaunchGate({
        assess: (action) => k.assess(action),
        loadRules: () => loadRules(env),
        effectGate: { kernel: k, projectRoot: root, operationId: `worker-run:${request.runId}`, scopeId: `worker-runtime:${request.ticketId}`, permissionMode: resolvePermissionMode(env) },
        projectRoot: root,
      }).authorize(request);
    },
  };
}
