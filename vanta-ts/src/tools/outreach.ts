import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult, ToolContext } from "./types.js";
import {
  draftMessage,
  approveBatch,
  markSent,
  recordReply,
  appendProof,
  listDrafts,
  pendingBatch,
  getWorkspace,
  readProof,
  type Draft,
} from "../outreach/store.js";

// `outreach` — the authorized brand workspace surface. DRAFT-ONLY by
// construction: `draft` only ever creates a draft, and `approve_batch` is the
// single path toward sending — it goes through `ctx.requestApproval` (the
// kernel/human batch-approval gate). There is no autonomous-send action. The
// identity surfaced is the operator-configured brand, never fabricated.

const Args = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("draft"),
    to: z.string().min(1),
    channel: z.string().min(1),
    body: z.string().min(1),
    subject: z.string().optional(),
    batchId: z.string().min(1).optional(),
  }),
  z.object({ action: z.literal("approve_batch"), batchId: z.string().min(1) }),
  z.object({ action: z.literal("reply"), ref: z.string().min(1), note: z.string().optional() }),
  z.object({
    action: z.literal("proof"),
    kind: z.enum(["sent", "received", "changed"]),
    ref: z.string().min(1),
    note: z.string().optional(),
  }),
  z.object({ action: z.literal("list"), batchId: z.string().min(1).optional() }),
]);
type ParsedArgs = z.infer<typeof Args>;

function dataDir(root: string): string {
  return join(root, ".vanta");
}

function fmtDraft(d: Draft): string {
  const subj = d.subject ? ` "${d.subject}"` : "";
  const batch = d.batchId ? ` [${d.batchId}]` : "";
  return `  · ${d.id} ${d.status} ${d.channel}→${d.to}${subj}${batch}`;
}

async function doDraft(dir: string, a: Extract<ParsedArgs, { action: "draft" }>): Promise<ToolResult> {
  const d = await draftMessage(dir, {
    to: a.to,
    channel: a.channel,
    body: a.body,
    subject: a.subject,
    batchId: a.batchId,
  });
  return { ok: true, output: `Drafted ${d.id} (status: draft — never sent without approval)\n${fmtDraft(d)}` };
}

async function doApproveBatch(
  dir: string,
  a: Extract<ParsedArgs, { action: "approve_batch" }>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const pending = await pendingBatch(dir, a.batchId);
  if (pending.length === 0) {
    return { ok: false, output: `no draft messages pending in batch "${a.batchId}"` };
  }
  const approved = await ctx.requestApproval(
    `Approve outreach batch "${a.batchId}" (${pending.length} message(s))`,
    "approves a batch of brand drafts for sending — this is the only path toward an outbound send",
  );
  if (!approved) return { ok: false, output: "denied" };
  const moved = await approveBatch(dir, a.batchId);
  return {
    ok: true,
    output: `Approved ${moved.length} draft(s) in "${a.batchId}".\n${moved.map(fmtDraft).join("\n")}`,
  };
}

async function doReply(dir: string, a: Extract<ParsedArgs, { action: "reply" }>): Promise<ToolResult> {
  const p = await recordReply(dir, a.ref, a.note);
  return { ok: true, output: `Recorded reply for ${a.ref} → proof "received" at ${p.at}` };
}

async function doProof(dir: string, a: Extract<ParsedArgs, { action: "proof" }>): Promise<ToolResult> {
  const p = await appendProof(dir, { kind: a.kind, ref: a.ref, note: a.note });
  return { ok: true, output: `Proof "${p.kind}" recorded for ${p.ref} at ${p.at}` };
}

async function doList(dir: string, a: Extract<ParsedArgs, { action: "list" }>): Promise<ToolResult> {
  const ws = await getWorkspace(dir);
  const drafts = (await listDrafts(dir)).filter((d) => !a.batchId || d.batchId === a.batchId);
  const proof = await readProof(dir);
  const identity = ws ? `${ws.brandName} <${ws.fromHandle}>` : "(no brand identity configured)";
  const lines = [
    `Brand: ${identity}`,
    drafts.length ? `Drafts (${drafts.length}):` : "Drafts: (none)",
    ...drafts.map(fmtDraft),
    `Proof ledger: ${proof.length} entr${proof.length === 1 ? "y" : "ies"}`,
  ];
  return { ok: true, output: lines.join("\n") };
}

async function run(args: ParsedArgs, ctx: ToolContext): Promise<ToolResult> {
  const dir = dataDir(ctx.root);
  switch (args.action) {
    case "draft":
      return doDraft(dir, args);
    case "approve_batch":
      return doApproveBatch(dir, args, ctx);
    case "reply":
      return doReply(dir, args);
    case "proof":
      return doProof(dir, args);
    case "list":
      return doList(dir, args);
  }
}

/** Recipient count for a safety description — never the message body. */
function recipientCount(raw: Record<string, unknown>): number {
  return typeof raw.to === "string" && raw.to.length > 0 ? 1 : 0;
}

export const outreachTool: Tool = {
  schema: {
    name: "outreach",
    description:
      "Authorized brand/outreach workspace — DRAFT-ONLY, batch-approved. " +
      "action:draft {to, channel, body, subject?, batchId?} creates a DRAFT (never sends). " +
      "action:approve_batch {batchId} requests human/kernel approval, then marks that batch's drafts approved (the only path toward sending). " +
      "action:reply {ref, note?} records an inbound reply to the proof ledger. " +
      "action:proof {kind, ref, note?} appends a sent/received/changed proof entry. " +
      "action:list [batchId] shows the brand identity, drafts, and proof-ledger size. " +
      "There is no autonomous-send action and the identity is the configured brand, never fabricated.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["draft", "approve_batch", "reply", "proof", "list"] },
        to: { type: "string", description: "draft: recipient" },
        channel: { type: "string", description: "draft: channel (e.g. email)" },
        body: { type: "string", description: "draft: message body" },
        subject: { type: "string", description: "draft: optional subject" },
        batchId: { type: "string", description: "draft/approve_batch/list: batch identifier" },
        ref: { type: "string", description: "reply/proof: the draft or thread reference" },
        note: { type: "string", description: "reply/proof: optional note" },
        kind: { type: "string", enum: ["sent", "received", "changed"], description: "proof: ledger entry kind" },
      },
      required: ["action"],
    },
  },
  // Surface only the action + recipient count to the kernel — never the body.
  describeForSafety: (a) => {
    const action = String(a.action ?? "");
    if (action === "approve_batch") return `approve outreach batch ${String(a.batchId ?? "")}`;
    if (action === "draft") return `draft outreach message to ${recipientCount(a)} recipient(s)`;
    return `outreach ${action}`;
  },
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'outreach needs an "action" (draft|approve_batch|reply|proof|list) with its fields' };
    }
    return run(parsed.data, ctx);
  },
};
