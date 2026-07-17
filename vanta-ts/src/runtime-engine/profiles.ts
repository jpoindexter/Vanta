import { createHash } from "node:crypto";
import { RuntimeLaunchPreviewSchema, RuntimeLaunchSpecSchema, type RuntimeEngineBackend, type RuntimeLaunchPreview, type RuntimeLaunchSpec } from "./types.js";

type Profile = { location: "local" | "remote"; support: "supported" | "contract_only"; command: string; args(spec: RuntimeLaunchSpec): string[]; memoryMultiplier: number };

const PROFILES: Record<RuntimeEngineBackend, Profile> = {
  mlx: { location: "local", support: "supported", command: "python3", memoryMultiplier: 1.18, args: (spec) => ["-m", "mlx_lm.server", "--model", spec.model, "--host", spec.host, "--port", String(spec.port)] },
  llama_cpp: { location: "local", support: "supported", command: "llama-server", memoryMultiplier: 1.12, args: (spec) => ["--model", spec.model, "--host", spec.host, "--port", String(spec.port), "--ctx-size", String(spec.contextTokens)] },
  vllm: { location: "remote", support: "contract_only", command: "python3", memoryMultiplier: 1.3, args: (spec) => ["-m", "vllm.entrypoints.openai.api_server", "--model", spec.model, "--host", spec.host, "--port", String(spec.port)] },
  sglang: { location: "remote", support: "contract_only", command: "python3", memoryMultiplier: 1.28, args: (spec) => ["-m", "sglang.launch_server", "--model-path", spec.model, "--host", spec.host, "--port", String(spec.port)] },
};

export function runtimeLaunchPreview(input: RuntimeLaunchSpec): RuntimeLaunchPreview {
  const spec = RuntimeLaunchSpecSchema.parse(input);
  const profile = PROFILES[spec.backend];
  const args = [...profile.args(spec), ...(spec.extraArgs ?? [])];
  const contextBytes = spec.contextTokens * 2048;
  const estimatedMemoryBytes = Math.ceil(spec.modelBytes * profile.memoryMultiplier + contextBytes);
  const environment = Object.fromEntries(Object.entries(spec.environment ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const commandHash = createHash("sha256").update(JSON.stringify([profile.command, args, environment])).digest("hex");
  return RuntimeLaunchPreviewSchema.parse({
    runtimeId: spec.id, backend: spec.backend, location: profile.location, support: profile.support,
    command: profile.command, args, environment, endpoint: `http://${spec.host}:${spec.port}`, commandHash,
    resource: { estimatedMemoryBytes, availableMemoryBytes: spec.availableMemoryBytes, headroomBytes: spec.availableMemoryBytes - estimatedMemoryBytes, fits: estimatedMemoryBytes <= spec.availableMemoryBytes },
    approvalAction: `launch ${spec.backend} runtime ${spec.id} with command ${commandHash}`,
  });
}
