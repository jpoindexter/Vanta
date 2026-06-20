import { listDrafts, readProof, getWorkspace, type Draft, type Proof } from "../outreach/store.js";
import type { SlashHandler } from "./types.js";

// `/outreach` — a window onto the authorized brand workspace: the configured
// brand identity, pending drafts (awaiting batch approval), and the append-only
// proof ledger. Read-only: it never drafts, approves, or sends.

const DRAFT_GLYPH: Record<Draft["status"], string> = { draft: "✎", approved: "✓", sent: "→" };
const PROOF_GLYPH: Record<Proof["kind"], string> = { sent: "→", received: "←", changed: "±" };

function draftLine(d: Draft): string {
  const subj = d.subject ? ` "${d.subject}"` : "";
  const batch = d.batchId ? ` [${d.batchId}]` : "";
  return `  ${DRAFT_GLYPH[d.status]} ${d.status.padEnd(8)} ${d.channel}→${d.to}${subj}${batch}`;
}

function proofLine(p: Proof): string {
  const note = p.note ? ` — ${p.note}` : "";
  return `  ${PROOF_GLYPH[p.kind]} ${p.kind.padEnd(8)} ${p.ref}${note}  (${p.at})`;
}

export const outreach: SlashHandler = async (_arg, ctx) => {
  const ws = await getWorkspace(ctx.dataDir);
  const drafts = await listDrafts(ctx.dataDir);
  const proof = await readProof(ctx.dataDir);

  const identity = ws
    ? `Brand: ${ws.brandName} <${ws.fromHandle}>`
    : "Brand: (none configured — set the workspace identity before drafting)";

  const pending = drafts.filter((d) => d.status === "draft");
  const draftSection = drafts.length
    ? [`Drafts (${pending.length} pending / ${drafts.length} total):`, ...drafts.map(draftLine)]
    : ["Drafts: (none — outbound is draft-only and starts here)"];

  const proofSection = proof.length
    ? [`Proof ledger (${proof.length}):`, ...proof.slice(-10).map(proofLine)]
    : ["Proof ledger: (empty)"];

  return { output: [identity, "", ...draftSection, "", ...proofSection].join("\n") };
};
