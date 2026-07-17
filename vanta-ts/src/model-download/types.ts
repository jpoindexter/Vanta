import { z } from "zod";

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const FilenameSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/);

export const ModelDownloadSourceSchema = z.object({
  kind: z.literal("hugging_face"),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  filename: FilenameSchema,
  authSecretRef: z.string().regex(/^secret:\/\/[a-zA-Z0-9._/-]+$/).optional(),
  manifestUrl: z.string().url().optional(),
});
export type ModelDownloadSource = z.infer<typeof ModelDownloadSourceSchema>;

export const ModelDownloadStatusSchema = z.enum([
  "queued", "downloading", "paused", "verifying", "completed", "failed",
]);
export type ModelDownloadStatus = z.infer<typeof ModelDownloadStatusSchema>;

export const ModelDownloadJobSchema = z.object({
  version: z.literal(1),
  id: IdSchema,
  label: z.string().min(1).max(160),
  source: ModelDownloadSourceSchema,
  storageRoot: z.string().min(1),
  destination: z.string().min(1),
  profileId: IdSchema.optional(),
  status: ModelDownloadStatusSchema,
  downloadedBytes: z.number().int().nonnegative(),
  resumedAt: z.number().int().nonnegative().optional(),
  failureCode: z.string().max(120).optional(),
  recovery: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});
export type ModelDownloadJob = z.infer<typeof ModelDownloadJobSchema>;

export const ModelDownloadReceiptSchema = z.object({
  version: z.literal(1),
  jobId: IdSchema,
  at: z.string().datetime(),
  transition: ModelDownloadStatusSchema.or(z.enum(["enqueued", "duplicate", "cleaned", "profile_linked"])),
  downloadedBytes: z.number().int().nonnegative(),
  destination: z.string(),
  code: z.string().max(120).optional(),
  profileId: IdSchema.optional(),
});
export type ModelDownloadReceipt = z.infer<typeof ModelDownloadReceiptSchema>;

export const CreateModelDownloadSchema = z.object({
  id: IdSchema,
  label: z.string().min(1).max(160),
  source: ModelDownloadSourceSchema,
  storageRoot: z.string().min(1).optional(),
  profileId: IdSchema.optional(),
});
export type CreateModelDownload = z.infer<typeof CreateModelDownloadSchema>;

const RECOVERY: Record<string, string> = {
  low_disk: "Free storage or choose another destination, then retry.",
  storage_moved: "Restore the storage location or enqueue the model at its new destination.",
  storage_unavailable: "Reconnect the storage destination, then resume the download.",
  auth_unavailable: "Grant the referenced Hugging Face token to this download, then retry.",
  download_http_401: "Grant the referenced Hugging Face token to this download, then retry.",
  download_http_403: "Grant the referenced Hugging Face token to this download, then retry.",
  offline_download: "Reconnect to the network, then resume from the partial artifact.",
  download_interrupted: "Reconnect to the network, then resume from the partial artifact.",
  checksum_mismatch: "The partial artifact was removed. Confirm the trusted checksum before retrying.",
  interrupted_restart: "Resume to continue from the persisted partial artifact.",
};

export function downloadRecovery(code: string): string {
  return RECOVERY[code] ?? "Review the download receipt, then retry or remove the partial artifact with confirmation.";
}
