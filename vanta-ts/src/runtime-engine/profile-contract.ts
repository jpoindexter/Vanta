import { z } from "zod";
import { runtimeLaunchPreview } from "./profiles.js";
import { RuntimeEngineBackendSchema, RuntimeLaunchSpecSchema, type RuntimeLaunchPreview, type RuntimeLaunchSpec } from "./types.js";

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const SecretRefSchema = z.string().regex(/^secret:\/\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
const EnvironmentEntrySchema = z.object({
  name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().optional(),
  secretRef: SecretRefSchema.optional(),
});
const ExtraArgSchema = z.object({ flag: z.string().regex(/^--[a-zA-Z0-9][a-zA-Z0-9-]*$/), value: z.string().optional(), reviewed: z.boolean().default(false) });
const PerformanceSchema = z.object({
  threads: z.number().int().min(1).max(512).optional(),
  gpuLayers: z.number().int().min(0).max(1000).optional(),
  batchSize: z.number().int().min(1).max(65_536).optional(),
  parallel: z.number().int().min(1).max(128).optional(),
  flashAttention: z.boolean().optional(),
}).default({});

export const RuntimeProfileV2Schema = z.object({
  version: z.literal(2),
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  backend: RuntimeEngineBackendSchema,
  model: z.object({ path: z.string().trim().min(1), bytes: z.number().int().positive() }),
  endpoint: z.object({ host: z.string().ip().default("127.0.0.1"), port: z.number().int().min(1).max(65_535), reviewedRemoteBind: z.boolean().default(false) }),
  resources: z.object({ contextTokens: z.number().int().min(256).max(1_000_000), availableMemoryBytes: z.number().int().positive() }),
  performance: PerformanceSchema,
  environment: z.array(EnvironmentEntrySchema).default([]),
  extraArgs: z.array(ExtraArgSchema).default([]),
  policyScope: z.enum(["ask", "approve", "full"]).default("ask"),
  compatibility: z.object({ platforms: z.array(z.string().min(1)), architectures: z.array(z.string().min(1)) }),
  reviewedContractOnly: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  clonedFrom: IdSchema.optional(),
});

const RuntimeProfileV1Schema = z.object({
  version: z.literal(1), id: IdSchema, name: z.string().min(1), backend: RuntimeEngineBackendSchema,
  model: z.string().min(1), modelBytes: z.number().int().positive(), host: z.string().ip(), port: z.number().int().min(1).max(65_535),
  contextTokens: z.number().int().min(256), availableMemoryBytes: z.number().int().positive(),
});

export type RuntimeProfile = z.infer<typeof RuntimeProfileV2Schema>;
export type RuntimeProfileHost = { platform: string; architecture: string; memoryBytes: number };
export type RuntimeProfileIssue = { code: string; severity: "error" | "review"; field: string; message: string; recovery: string };
export type RuntimeProfileValidation = { valid: boolean; compatible: boolean; issues: RuntimeProfileIssue[]; resource?: RuntimeLaunchPreview["resource"] };
export type CreateRuntimeProfileInput = {
  id: string; name: string; backend: RuntimeProfile["backend"]; modelPath: string; modelBytes: number; availableMemoryBytes: number;
  host?: string; port?: number; contextTokens?: number; performance?: RuntimeProfile["performance"];
  environment?: RuntimeProfile["environment"]; extraArgs?: RuntimeProfile["extraArgs"]; policyScope?: RuntimeProfile["policyScope"];
  compatibility?: RuntimeProfile["compatibility"]; reviewedRemoteBind?: boolean; reviewedContractOnly?: boolean; clonedFrom?: string;
};

const UNSAFE_FLAGS = new Set(["--disable-auth", "--allow-remote-code", "--trust-remote-code", "--no-sandbox"]);
const CONTRACT_ONLY = new Set<RuntimeProfile["backend"]>(["vllm", "sglang"]);
const SENSITIVE_ENV = /(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|PRIVATE_KEY)/i;

function orDefault<T>(value: T | undefined, fallback: T): T { return value ?? fallback; }

function compatibilityFor(backend: RuntimeProfile["backend"]): RuntimeProfile["compatibility"] {
  if (backend === "mlx") return { platforms: ["darwin"], architectures: ["arm64"] };
  if (backend === "llama_cpp") return { platforms: ["darwin", "linux", "win32"], architectures: ["arm64", "x64"] };
  return { platforms: ["linux"], architectures: ["arm64", "x64"] };
}

export function createRuntimeProfile(input: CreateRuntimeProfileInput, now = () => new Date()): RuntimeProfile {
  const stamp = now().toISOString();
  return RuntimeProfileV2Schema.parse({
    version: 2, id: input.id, name: input.name, backend: input.backend,
    model: { path: input.modelPath, bytes: input.modelBytes },
    endpoint: { host: orDefault(input.host, "127.0.0.1"), port: orDefault(input.port, 8129), reviewedRemoteBind: orDefault(input.reviewedRemoteBind, false) },
    resources: { contextTokens: orDefault(input.contextTokens, 8192), availableMemoryBytes: input.availableMemoryBytes },
    performance: orDefault(input.performance, {}), environment: orDefault(input.environment, []), extraArgs: orDefault(input.extraArgs, []),
    policyScope: orDefault(input.policyScope, "ask"), compatibility: orDefault(input.compatibility, compatibilityFor(input.backend)),
    reviewedContractOnly: orDefault(input.reviewedContractOnly, false), createdAt: stamp, updatedAt: stamp, clonedFrom: input.clonedFrom,
  });
}

export function migrateRuntimeProfile(input: unknown, now = () => new Date()): RuntimeProfile {
  const current = RuntimeProfileV2Schema.safeParse(input);
  if (current.success) return current.data;
  const legacy = RuntimeProfileV1Schema.parse(input);
  return createRuntimeProfile({
    id: legacy.id, name: legacy.name, backend: legacy.backend, modelPath: legacy.model, modelBytes: legacy.modelBytes,
    host: legacy.host, port: legacy.port, contextTokens: legacy.contextTokens, availableMemoryBytes: legacy.availableMemoryBytes,
  }, now);
}

function issue(input: RuntimeProfileIssue): RuntimeProfileIssue {
  return input;
}

function performanceArgs(profile: RuntimeProfile): string[] {
  const value = profile.performance;
  if (profile.backend !== "llama_cpp") return [];
  return [
    ...(value.threads === undefined ? [] : ["--threads", String(value.threads)]),
    ...(value.gpuLayers === undefined ? [] : ["--n-gpu-layers", String(value.gpuLayers)]),
    ...(value.batchSize === undefined ? [] : ["--batch-size", String(value.batchSize)]),
    ...(value.parallel === undefined ? [] : ["--parallel", String(value.parallel)]),
    ...(value.flashAttention === undefined ? [] : ["--flash-attn", value.flashAttention ? "on" : "off"]),
  ];
}

function profileSpec(profile: RuntimeProfile, host: RuntimeProfileHost): RuntimeLaunchSpec {
  const environment = Object.fromEntries(profile.environment.map((entry) => [entry.name, entry.secretRef ?? entry.value ?? ""]));
  const extraArgs = [...performanceArgs(profile), ...profile.extraArgs.flatMap((entry) => [entry.flag, ...(entry.value === undefined ? [] : [entry.value])])];
  return RuntimeLaunchSpecSchema.parse({
    id: profile.id, backend: profile.backend, model: profile.model.path, host: profile.endpoint.host, port: profile.endpoint.port,
    contextTokens: profile.resources.contextTokens, modelBytes: profile.model.bytes,
    availableMemoryBytes: Math.min(profile.resources.availableMemoryBytes, host.memoryBytes), retainOnFailure: false,
    extraArgs, environment,
  });
}

export function validateRuntimeProfile(input: unknown, host: RuntimeProfileHost): RuntimeProfileValidation {
  let profile: RuntimeProfile;
  try { profile = migrateRuntimeProfile(input); }
  catch (error) {
    return { valid: false, compatible: false, issues: [issue({ code: "invalid_profile", severity: "error", field: "profile", message: error instanceof Error ? error.message : String(error), recovery: "Fix the profile fields or import a valid v1/v2 profile, then validate again." })] };
  }
  const compatible = profile.compatibility.platforms.includes(host.platform) && profile.compatibility.architectures.includes(host.architecture);
  const preview = runtimeLaunchPreview(profileSpec(profile, host));
  const issues = [
    ...compatibilityIssues(profile, host, compatible),
    ...environmentIssues(profile),
    ...extraArgIssues(profile),
    ...resourceIssues(preview),
  ];
  return { valid: issues.length === 0, compatible, issues, resource: preview.resource };
}

function compatibilityIssues(profile: RuntimeProfile, host: RuntimeProfileHost, compatible: boolean): RuntimeProfileIssue[] {
  const issues: RuntimeProfileIssue[] = [];
  if (!compatible) issues.push(issue({ code: "host_incompatible", severity: "error", field: "compatibility", message: `${profile.backend} is not compatible with ${host.platform}/${host.architecture}.`, recovery: "Clone this profile and choose a backend compatible with this host." }));
  if (profile.backend !== "llama_cpp" && Object.values(profile.performance).some((value) => value !== undefined)) issues.push(issue({ code: "performance_unsupported", severity: "error", field: "performance", message: `Advanced performance controls are not mapped for ${profile.backend}.`, recovery: "Remove these controls or clone the profile with llama_cpp." }));
  if (CONTRACT_ONLY.has(profile.backend) && !profile.reviewedContractOnly) issues.push(issue({ code: "contract_only_review", severity: "review", field: "backend", message: `${profile.backend} is contract-only until its remote transport is live-proven.`, recovery: "Review the remote transport boundary and set reviewedContractOnly explicitly." }));
  if (!["127.0.0.1", "::1"].includes(profile.endpoint.host) && !profile.endpoint.reviewedRemoteBind) issues.push(issue({ code: "remote_bind_review", severity: "review", field: "endpoint.host", message: "The runtime binds beyond loopback.", recovery: "Review network exposure and set reviewedRemoteBind explicitly." }));
  return issues;
}

function environmentIssues(profile: RuntimeProfile): RuntimeProfileIssue[] {
  const issues: RuntimeProfileIssue[] = [];
  for (const entry of profile.environment) {
    if ((entry.value === undefined) === (entry.secretRef === undefined)) issues.push(issue({ code: "environment_value", severity: "error", field: `environment.${entry.name}`, message: "Environment entries require exactly one literal value or secret reference.", recovery: "Set value or secretRef, but not both." }));
    if (SENSITIVE_ENV.test(entry.name) && entry.value !== undefined) issues.push(issue({ code: "embedded_secret", severity: "error", field: `environment.${entry.name}`, message: "Sensitive environment values cannot be embedded in a profile.", recovery: "Store the secret in Vanta's vault and use a secret:// reference." }));
  }
  return issues;
}

function extraArgIssues(profile: RuntimeProfile): RuntimeProfileIssue[] {
  const issues: RuntimeProfileIssue[] = [];
  for (const arg of profile.extraArgs) {
    if (UNSAFE_FLAGS.has(arg.flag)) issues.push(issue({ code: "unsafe_flag", severity: "error", field: "extraArgs", message: `${arg.flag} weakens the runtime boundary.`, recovery: "Remove the flag; Vanta does not launch profiles that disable a security boundary." }));
    else if (!arg.reviewed) issues.push(issue({ code: "flag_review_required", severity: "review", field: "extraArgs", message: `${arg.flag} is outside Vanta's mapped backend controls.`, recovery: "Review the generated command and mark this flag reviewed explicitly." }));
  }
  return issues;
}

function resourceIssues(preview: RuntimeLaunchPreview): RuntimeProfileIssue[] {
  return preview.resource.fits ? [] : [issue({ code: "resource_fit", severity: "error", field: "resources", message: "The estimated runtime memory exceeds current host memory.", recovery: "Reduce context/model size or select a host with more memory." })];
}

export function runtimeProfileLaunchContract(input: unknown, host: RuntimeProfileHost) {
  const profile = migrateRuntimeProfile(input);
  const validation = validateRuntimeProfile(profile, host);
  const spec = profileSpec(profile, host);
  const preview = runtimeLaunchPreview(spec);
  const restored = RuntimeLaunchSpecSchema.parse(JSON.parse(JSON.stringify(spec)));
  const roundTrip = runtimeLaunchPreview(restored).commandHash === preview.commandHash;
  return { profile, validation, spec, preview, roundTrip };
}
