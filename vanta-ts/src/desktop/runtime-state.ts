import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  RuntimeProcessStateSchema,
  type RuntimeLaunchSpec,
  type RuntimeProcessState,
} from "../runtime-engine/types.js";
import {
  RuntimeHostConfigSchema,
  type RuntimeHostConfig,
  type RuntimeObservation,
} from "../runtime-controller/types.js";

export const LOCAL_RUNTIME_HOST: RuntimeHostConfig = {
  id: "local",
  label: "Local Mac",
  kind: "local",
  endpoint: "http://127.0.0.1",
  authRequired: false,
};

export function configuredRuntimeHosts(env: Record<string, string | undefined>): RuntimeHostConfig[] {
  const raw = env.VANTA_RUNTIME_HOSTS;
  if (!raw) return [LOCAL_RUNTIME_HOST];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [LOCAL_RUNTIME_HOST];
    const remote = parsed.map((host) => RuntimeHostConfigSchema.parse(host)).filter((host) => host.id !== LOCAL_RUNTIME_HOST.id);
    return [LOCAL_RUNTIME_HOST, ...remote];
  } catch {
    return [LOCAL_RUNTIME_HOST];
  }
}

export async function latestRuntimeState(root: string): Promise<RuntimeProcessState | null> {
  const directory = join(root, ".vanta", "runtime-engines");
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")); }
  catch { return null; }
  const states: RuntimeProcessState[] = [];
  for (const name of names) {
    try {
      states.push(RuntimeProcessStateSchema.parse(JSON.parse(await readFile(join(directory, name), "utf8"))));
    } catch {
      // A damaged state file cannot hide the remaining runtime observations.
    }
  }
  return states.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export function runtimeLifecycle(state: RuntimeProcessState | null): RuntimeObservation["engine"]["lifecycle"] {
  if (!state || state.status === "stopped") return "idle";
  return state.status;
}

export function runtimeLaunchSpec(state: RuntimeProcessState): RuntimeLaunchSpec {
  return {
    id: state.runtimeId,
    backend: state.backend,
    model: state.model,
    host: state.host,
    port: state.port,
    contextTokens: state.contextTokens,
    modelBytes: state.modelBytes,
    availableMemoryBytes: state.availableMemoryBytes,
    retainOnFailure: state.retainOnFailure,
    extraArgs: state.extraArgs,
    environment: state.environment,
  };
}
