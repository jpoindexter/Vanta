import { z } from "zod";
import { AgentNodeSchema, WorkflowIdSchema as Id } from "./node-schema.js";

const ModelChoiceSchema = z.object({
  provider: Id,
  model: z.string().min(1),
  estimatedCostUsd: z.number().nonnegative(),
});

const AdaptiveTemplateSchema = z.object({
  node: AgentNodeSchema,
  estimatedCostUsd: z.number().nonnegative(),
});

export const AdaptivePolicySchema = z.object({
  templates: z.record(Id, AdaptiveTemplateSchema),
  modelClasses: z.record(Id, z.array(ModelChoiceSchema).min(1).max(10)),
  limits: z.object({
    maxFanOut: z.number().int().min(1).max(7),
    maxDepth: z.number().int().min(1).max(10),
    maxChanges: z.number().int().min(1).max(20),
    maxTokens: z.number().int().positive(),
    maxCostUsd: z.number().positive(),
    maxWallClockMs: z.number().int().positive(),
  }),
  thresholds: z.object({
    lowConfidence: z.number().min(0).max(1),
    trivialComplexity: z.number().min(0).max(1),
    tightBudgetUsd: z.number().nonnegative(),
    highRisk: z.number().min(0).max(1),
  }),
  routes: z.object({
    fanOut: z.object({ source: Id, template: Id }).optional(),
    collapse: z.object({ source: Id, to: Id }).optional(),
    budget: z.object({ source: Id, target: Id, modelClass: Id }).optional(),
    risk: z.object({ source: Id, escalate: Id }).optional(),
  }),
});

export const AdaptiveProposalSchema = z.object({
  confidence: z.number().min(0).max(1),
  complexity: z.number().min(0).max(1),
  remainingCostUsd: z.number().nonnegative(),
  risk: z.number().min(0).max(1),
  evidence: z.string().min(1),
}).strict();

export const AdaptiveChangeSchema = z.object({
  kind: z.enum(["fan-out", "collapse", "budget-route", "risk-escalation"]),
  source: Id,
  target: Id.optional(),
  template: Id.optional(),
  spawnedNode: Id.optional(),
  provider: Id.optional(),
  model: z.string().min(1).optional(),
  modelClass: Id.optional(),
});

export const AdaptiveReceiptSchema = z.object({
  id: Id,
  status: z.enum(["applied", "denied"]),
  triggerEvidence: z.string().min(1),
  beforeRevision: z.number().int().positive(),
  afterRevision: z.number().int().positive(),
  budgetImpactUsd: z.number(),
  kernelVerdict: z.enum(["allow", "ask", "block", "operator-denied", "policy-denied"]),
  change: AdaptiveChangeSchema,
  at: z.string(),
  reason: z.string().min(1),
});

export type AdaptivePolicy = z.infer<typeof AdaptivePolicySchema>;
export type AdaptiveProposal = z.infer<typeof AdaptiveProposalSchema>;
export type AdaptiveChange = z.infer<typeof AdaptiveChangeSchema>;
export type AdaptiveReceipt = z.infer<typeof AdaptiveReceiptSchema>;
