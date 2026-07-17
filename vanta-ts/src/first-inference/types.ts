import { z } from "zod";

export const FirstInferenceModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
  label: z.string().min(1),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/),
  contextTokens: z.number().int().min(256).max(131_072),
});
export type FirstInferenceModel = z.infer<typeof FirstInferenceModelSchema>;

export const FirstInferenceHardwareSchema = z.object({
  platform: z.string(),
  architecture: z.string(),
  memoryBytes: z.number().int().nonnegative(),
  freeDiskBytes: z.number().int().nonnegative(),
  runtimeAvailable: z.boolean(),
  supported: z.boolean(),
  reason: z.enum(["ready", "unsupported_platform", "unsupported_architecture", "runtime_missing"]),
});
export type FirstInferenceHardware = z.infer<typeof FirstInferenceHardwareSchema>;

export const FirstInferenceStatusSchema = z.enum([
  "ready", "downloading", "downloaded", "launching", "running", "task_verified",
  "done", "cancelled", "failed",
]);
export type FirstInferenceStatus = z.infer<typeof FirstInferenceStatusSchema>;

export const FirstInferenceCheckpointSchema = z.object({
  version: z.literal(1),
  wizardId: z.string(),
  modelId: z.string(),
  status: FirstInferenceStatusSchema,
  downloadedBytes: z.number().int().nonnegative(),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  runtimeId: z.string().optional(),
  failureCode: z.string().max(120).optional(),
  updatedAt: z.string().datetime(),
});
export type FirstInferenceCheckpoint = z.infer<typeof FirstInferenceCheckpointSchema>;

export const FirstInferenceReceiptSchema = z.object({
  version: z.literal(1),
  wizardId: z.string(),
  modelId: z.string(),
  at: z.string().datetime(),
  transition: FirstInferenceStatusSchema,
  code: z.string().max(120).optional(),
  metrics: z.object({
    downloadedBytes: z.number().int().nonnegative().optional(),
    downloadResumedAt: z.number().int().nonnegative().optional(),
    latencyMs: z.number().int().nonnegative().optional(),
    outputCharacters: z.number().int().nonnegative().optional(),
  }).optional(),
  responseSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export type FirstInferenceReceipt = z.infer<typeof FirstInferenceReceiptSchema>;

export const QWEN_05B_Q4_K_M: FirstInferenceModel = FirstInferenceModelSchema.parse({
  id: "qwen2.5-0.5b-instruct-q4-k-m",
  label: "Qwen 2.5 0.5B Instruct (Q4_K_M)",
  url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  sha256: "74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db",
  bytes: 491_400_032,
  filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
  contextTokens: 2_048,
});
