import { z } from "zod";

export const RuntimeEngineBackendSchema = z.enum(["mlx", "llama_cpp", "vllm", "sglang"]);
export type RuntimeEngineBackend = z.infer<typeof RuntimeEngineBackendSchema>;

export const RuntimeLaunchSpecSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  backend: RuntimeEngineBackendSchema,
  model: z.string().min(1),
  host: z.string().ip().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535),
  contextTokens: z.number().int().min(256).max(1_000_000).default(8192),
  modelBytes: z.number().int().positive(),
  availableMemoryBytes: z.number().int().positive(),
  retainOnFailure: z.boolean().default(false),
});
export type RuntimeLaunchSpec = z.infer<typeof RuntimeLaunchSpecSchema>;

export const RuntimeLaunchPreviewSchema = z.object({
  runtimeId: z.string(),
  backend: RuntimeEngineBackendSchema,
  location: z.enum(["local", "remote"]),
  support: z.enum(["supported", "contract_only"]),
  command: z.string().min(1),
  args: z.array(z.string()),
  endpoint: z.string().url(),
  commandHash: z.string().regex(/^[a-f0-9]{64}$/),
  resource: z.object({ estimatedMemoryBytes: z.number().int().positive(), availableMemoryBytes: z.number().int().positive(), headroomBytes: z.number().int(), fits: z.boolean() }),
  approvalAction: z.string().min(1),
});
export type RuntimeLaunchPreview = z.infer<typeof RuntimeLaunchPreviewSchema>;

export const RuntimeProcessStateSchema = z.object({
  version: z.literal(1),
  runtimeId: z.string(),
  backend: RuntimeEngineBackendSchema,
  model: z.string(),
  host: z.string(),
  port: z.number().int(),
  contextTokens: z.number().int(),
  modelBytes: z.number().int(),
  availableMemoryBytes: z.number().int(),
  retainOnFailure: z.boolean(),
  commandHash: z.string(),
  pid: z.number().int().positive().optional(),
  status: z.enum(["starting", "running", "failed", "stopping", "stopped"]),
  updatedAt: z.string().datetime(),
});
export type RuntimeProcessState = z.infer<typeof RuntimeProcessStateSchema>;

export const RuntimeLifecycleReceiptSchema = z.object({
  version: z.literal(1), runtimeId: z.string(), backend: RuntimeEngineBackendSchema, at: z.string().datetime(),
  transition: z.enum(["previewed", "kernel_blocked", "approval_requested", "approval_denied", "approved", "starting", "healthy", "benchmarked", "provider_turn_verified", "running", "failed", "retained_after_failure", "stopped_after_failure", "stopping", "stopped", "recovered", "stale_process"]),
  commandHash: z.string().regex(/^[a-f0-9]{64}$/),
  code: z.string().max(120).optional(),
  metrics: z.object({ latencyMs: z.number().nonnegative().optional(), outputTokens: z.number().int().nonnegative().optional() }).optional(),
});
export type RuntimeLifecycleReceipt = z.infer<typeof RuntimeLifecycleReceiptSchema>;

export type RuntimeProcessPort = {
  start(command: string, args: readonly string[]): Promise<{ pid: number }>;
  alive(pid: number): Promise<boolean>;
  stop(pid: number): Promise<void>;
};

export type RuntimeLifecycleManager = {
  preview(spec: RuntimeLaunchSpec): RuntimeLaunchPreview;
  launch(spec: RuntimeLaunchSpec): Promise<{ state: RuntimeProcessState; preview: RuntimeLaunchPreview; benchmark: { latencyMs: number; outputTokens: number }; providerText: string }>;
  stop(runtimeId: string): Promise<RuntimeProcessState>;
  recover(): Promise<RuntimeProcessState[]>;
};
