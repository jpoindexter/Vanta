import type { Worker } from "../team/store.js";
import { runtimeIdFromAdapter } from "../worker-runtimes/adapter-id.js";
import { createDefaultRegistry } from "../worker-runtimes/default-registry.js";
import { toEnginePort } from "../worker-runtimes/port-bridge.js";
import type { RuntimeRegistry } from "../worker-runtimes/registry.js";
import { createNativeRuntime } from "./company-native-runtime.js";
import type { WorkerRuntime as EnginePort } from "./company-ports.js";
import type { SpawnFactory } from "../worker-runtimes/exec-core.js";
import type { ProbeFn } from "../worker-runtimes/probe.js";
import { createDesktopLaunchGate, type GateSeams } from "./company-run-runtimes.js";
import type { DesktopState } from "./handler-state.js";

// Which runtime runs a hired worker's tickets. A provider adapter ("openai")
// is the Vanta native loop on that model backend; "cli:<id>" is an external CLI
// from the worker-runtime registry. Nothing is probed or launched here: the
// engine calls this while it holds the company lock, so detection, the launch
// approval and the process all happen inside run().

/** Test seams: a fake process, fake detection and a stand-in kernel. Production passes none. */
export type RuntimeSeams = GateSeams & { spawnFactory?: SpawnFactory; probe?: ProbeFn };

export async function desktopRegistry(state: DesktopState, seams: RuntimeSeams = {}): Promise<RuntimeRegistry> {
  const env = state._env ?? process.env;
  return createDefaultRegistry({ gate: createDesktopLaunchGate(state, seams), env, spawnFactory: seams.spawnFactory, probe: seams.probe, native: { port: async () => createNativeRuntime(state), env } });
}

function externalPort(state: DesktopState, runtimeId: string, seams: RuntimeSeams): EnginePort {
  return {
    id: runtimeId,
    async run(request) {
      const registry = await desktopRegistry(state, seams);
      const runtime = registry.get(runtimeId);
      if (!runtime) return { ok: false, error: `no worker runtime "${runtimeId}". Known: ${registry.list().map((r) => r.id).join(", ")}. Declare other CLIs in agents.json.` };
      const detected = await runtime.detect({ env: request.env });
      if (!detected.installed) return { ok: false, error: `${runtime.displayName} is not available on this machine: ${detected.reason ?? "not installed"}` };
      if (detected.auth === "unauthenticated") return { ok: false, error: `${runtime.displayName} is not signed in. Sign in with its own CLI, then retry the ticket.` };
      return toEnginePort(runtime, (input) => registry.run(runtimeId, input)).run(request);
    },
  };
}

export function selectRuntime(state: DesktopState, worker?: Worker, seams: RuntimeSeams = {}): EnginePort {
  const runtimeId = runtimeIdFromAdapter(worker?.adapter);
  return runtimeId ? externalPort(state, runtimeId, seams) : createNativeRuntime(state);
}
