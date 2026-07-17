import { z } from "zod";

export const RuntimeHostConfigSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  label: z.string().min(1).max(120),
  kind: z.enum(["local", "remote"]),
  endpoint: z.string().url(),
  authRequired: z.boolean().default(false),
  credentialRef: z.string().min(1).optional(),
});
export type RuntimeHostConfig = z.infer<typeof RuntimeHostConfigSchema>;

export const RuntimeLifecycleSchema = z.enum(["idle", "starting", "running", "stopping", "failed"]);
export const RuntimeControllerStatusSchema = z.enum(["offline", "auth_required", "idle", "starting", "running", "stopping", "failed", "degraded"]);
export const RuntimeTransportStatusSchema = z.enum(["reachable", "offline", "auth_required"]);
export const RuntimeKernelStatusSchema = z.enum(["ready", "not_ready", "unknown"]);

export const RuntimeResourcesSchema = z.object({
  memoryUsedBytes: z.number().int().nonnegative().optional(),
  memoryTotalBytes: z.number().int().positive().optional(),
  gpuUsedBytes: z.number().int().nonnegative().optional(),
  gpuTotalBytes: z.number().int().positive().optional(),
  utilizationPercent: z.number().min(0).max(100).optional(),
  throughputPerSecond: z.number().nonnegative().optional(),
});

export const RuntimeObservationSchema = z.object({
  observedAt: z.string().datetime(),
  epoch: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  transport: RuntimeTransportStatusSchema,
  kernel: RuntimeKernelStatusSchema,
  engine: z.object({
    id: z.string().min(1).max(120).optional(),
    lifecycle: RuntimeLifecycleSchema,
    model: z.string().min(1).max(200).optional(),
  }),
  resources: RuntimeResourcesSchema.default({}),
  queueDepth: z.number().int().nonnegative().default(0),
});
export type RuntimeObservation = z.infer<typeof RuntimeObservationSchema>;

export const RuntimeControllerSnapshotSchema = z.object({
  host: z.object({ id: z.string(), label: z.string(), kind: z.enum(["local", "remote"]) }),
  status: RuntimeControllerStatusSchema,
  transport: RuntimeTransportStatusSchema,
  kernel: RuntimeKernelStatusSchema,
  engine: RuntimeObservationSchema.shape.engine,
  resources: RuntimeResourcesSchema,
  queueDepth: z.number().int().nonnegative(),
  observedAt: z.string().datetime(),
  stale: z.boolean(),
  epoch: z.string(),
  sequence: z.number().int().nonnegative(),
});
export type RuntimeControllerSnapshot = z.infer<typeof RuntimeControllerSnapshotSchema>;

export const RuntimeControllerEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("snapshot"), hostId: z.string(), snapshot: RuntimeControllerSnapshotSchema }),
  z.object({ kind: z.literal("gap"), hostId: z.string(), epoch: z.string(), after: z.number().int().nonnegative(), next: z.number().int().nonnegative(), lost: z.number().int().positive() }),
  z.object({ kind: z.literal("restart"), hostId: z.string(), previousEpoch: z.string(), epoch: z.string() }),
  z.object({ kind: z.literal("reconnect"), hostId: z.string(), attempt: z.number().int().positive() }),
  z.object({ kind: z.literal("stale"), hostId: z.string(), observedAt: z.string().datetime() }),
]);
export type RuntimeControllerEvent = z.infer<typeof RuntimeControllerEventSchema>;

export type RuntimeControllerCursor = { epoch?: string; sequence?: number };

export interface RuntimeControllerTransport {
  inspect(host: RuntimeHostConfig, credential?: string): Promise<RuntimeObservation>;
  stream(host: RuntimeHostConfig, credential: string | undefined, cursor: RuntimeControllerCursor, signal?: AbortSignal): AsyncIterable<RuntimeObservation>;
}

export interface RuntimeControllerAdapter {
  discover(): Promise<RuntimeControllerSnapshot[]>;
  inspect(hostId: string): Promise<RuntimeControllerSnapshot>;
  events(hostId: string, options?: { cursor?: RuntimeControllerCursor; maxEvents?: number; maxReconnects?: number; signal?: AbortSignal }): AsyncIterable<RuntimeControllerEvent>;
}
