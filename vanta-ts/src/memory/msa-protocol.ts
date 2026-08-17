import { z } from "zod";

export const MSA_PATHS = {
  health: "/v1/health",
  index: "/v1/memories",
  query: "/v1/query",
  generate: "/v1/generate",
} as const;

// Runtime output is untrusted. Remove terminal/control bytes before it can enter
// a prompt or transcript while preserving tabs and newlines.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function sanitizeMsaText(text: string): string {
  return text.replace(CONTROL_CHARS, "").trim();
}

const ExternalText = z.string().transform(sanitizeMsaText);
const MetadataValue = z.union([ExternalText, z.number().finite(), z.boolean(), z.null()]);
export const MsaMetadataSchema = z.record(MetadataValue);
export type MsaMetadata = z.infer<typeof MsaMetadataSchema>;

export const MsaDocumentSchema = z.object({
  id: z.string().min(1).max(512),
  text: z.string().min(1),
  metadata: MsaMetadataSchema.optional(),
});
export type MsaDocument = z.infer<typeof MsaDocumentSchema>;

export const MsaIndexRequestSchema = z.object({
  documents: z.array(MsaDocumentSchema).min(1).max(100),
  namespace: z.string().min(1).max(256).optional(),
});
export type MsaIndexRequest = z.infer<typeof MsaIndexRequestSchema>;

export const MsaQueryRequestSchema = z.object({
  query: z.string().min(1).max(65_536),
  topK: z.number().int().min(1).max(50).default(10),
  namespace: z.string().min(1).max(256).optional(),
});
export type MsaQueryRequest = z.input<typeof MsaQueryRequestSchema>;

export const MsaGenerateRequestSchema = MsaQueryRequestSchema.extend({
  maxOutputTokens: z.number().int().min(1).max(16_384).optional(),
});
export type MsaGenerateRequest = z.input<typeof MsaGenerateRequestSchema>;

export const MsaHealthSchema = z.object({
  ready: z.boolean(),
  status: z.enum(["ok", "degraded", "starting"]).default("ok"),
  model: ExternalText.optional(),
  device: ExternalText.optional(),
  version: ExternalText.optional(),
});
export type MsaHealth = z.infer<typeof MsaHealthSchema>;

export const MsaIndexReceiptSchema = z.object({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative().default(0),
  namespace: ExternalText.optional(),
  indexedIds: z.array(ExternalText).optional(),
});
export type MsaIndexReceipt = z.infer<typeof MsaIndexReceiptSchema>;

export const MsaHitSchema = z.object({
  id: ExternalText,
  text: ExternalText,
  score: z.number().finite().min(-1).max(1).optional(),
  source: ExternalText.optional(),
  metadata: MsaMetadataSchema.optional(),
});
export type MsaHit = z.infer<typeof MsaHitSchema>;

export const MsaQueryResponseSchema = z.object({
  results: z.array(MsaHitSchema),
  latencyMs: z.number().finite().nonnegative().optional(),
});
export type MsaQueryResponse = z.infer<typeof MsaQueryResponseSchema>;

export const MsaGenerateResponseSchema = z.object({
  answer: ExternalText,
  citations: z.array(MsaHitSchema).default([]),
  latencyMs: z.number().finite().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});
export type MsaGenerateResponse = z.infer<typeof MsaGenerateResponseSchema>;

export type MsaOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; kind: "unavailable" | "request_failed" | "invalid_response" };
