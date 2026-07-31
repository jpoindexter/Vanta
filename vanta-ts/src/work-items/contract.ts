import { z } from "zod";

export const WORK_ITEM_STATES = [
  "draft",
  "queued",
  "running",
  "waiting",
  "needs human",
  "stopped",
  "failed",
  "unverified",
  "verified",
] as const;
export type WorkItemState = typeof WORK_ITEM_STATES[number];

export const RECEIPT_DISPOSITIONS = [
  "none",
  "confirmed",
  "denied",
  "expired",
  "unknown",
  "compensated",
] as const;
export type ReceiptDisposition = typeof RECEIPT_DISPOSITIONS[number];

const Timestamp = z.string().datetime();

export const WorkItemSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  outcome: z.string().min(1),
  source: z.string().min(1),
  state: z.enum(WORK_ITEM_STATES),
  runId: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  waitCondition: z.string().min(1).optional(),
  nextAction: z.string().min(1).optional(),
  resumeContext: z.string().min(1).optional(),
  updatedAt: Timestamp,
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

export const RunSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  workItemId: z.string().min(1),
  state: z.enum(WORK_ITEM_STATES),
  actor: z.string().min(1),
  startedAt: Timestamp.optional(),
  settledAt: Timestamp.optional(),
});
export type Run = z.infer<typeof RunSchema>;

export const ApprovalSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  workItemId: z.string().min(1),
  runId: z.string().min(1),
  actionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["requested", "approved", "denied", "expired"]),
  at: Timestamp,
  expiresAt: Timestamp.optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ReceiptSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  workItemId: z.string().min(1),
  runId: z.string().min(1),
  action: z.string().min(1),
  disposition: z.enum(RECEIPT_DISPOSITIONS),
  verification: z.enum(["unverified", "verified"]).optional(),
  evidence: z.string().min(1).optional(),
  at: Timestamp,
});
export type Receipt = z.infer<typeof ReceiptSchema>;

const TRANSITIONS: Record<WorkItemState, readonly WorkItemState[]> = {
  draft: ["queued", "stopped"],
  queued: ["running", "waiting", "needs human", "stopped", "failed"],
  running: ["waiting", "needs human", "stopped", "failed", "unverified", "verified"],
  waiting: ["queued", "running", "needs human", "stopped", "failed", "unverified", "verified"],
  "needs human": ["queued", "running", "stopped", "failed"],
  stopped: ["queued"],
  failed: ["queued", "running"],
  unverified: ["queued", "running", "waiting", "failed", "verified"],
  verified: [],
};

export function transitionAllowed(from: WorkItemState, to: WorkItemState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function settleWorkItem(input: {
  ok: boolean;
  disposition: ReceiptDisposition;
  verification?: "unverified" | "verified";
}): WorkItemState {
  if (input.disposition === "denied" || input.disposition === "expired" || input.disposition === "compensated") {
    return "stopped";
  }
  if (input.disposition === "unknown") return "unverified";
  if (!input.ok) return "failed";
  return input.verification === "verified" ? "verified" : "unverified";
}

export function canCreateAccomplishmentMemory(state: WorkItemState): boolean {
  return state === "verified";
}
