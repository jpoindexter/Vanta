import { z } from "zod";

export const ReviewedArtifactSchema = z.object({ artifactRef: z.string().min(1), revision: z.string().min(1) });
export const ReviewFindingSchema = z.object({
  rubricItem: z.string().min(1),
  evidence: z.string().min(1),
  affectedArtifact: ReviewedArtifactSchema,
  severity: z.enum(["low", "medium", "high", "critical"]),
  requestedChange: z.string().min(1),
});
export const ReviewPacketSchema = z.object({
  accepted: z.boolean(),
  artifact: ReviewedArtifactSchema,
  findings: z.array(ReviewFindingSchema).max(50),
}).refine((packet) => packet.accepted || packet.findings.length > 0, "rejected review needs findings");

export type ReviewPacket = z.infer<typeof ReviewPacketSchema>;
