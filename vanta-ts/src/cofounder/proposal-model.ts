import { z } from "zod";

// COFOUNDER-SELF-ORGANIZATION (pure model) — the proposal domain: schema,
// signal-driven generation, and the ratify/reject lifecycle. No I/O lives here;
// the engine proposes, the owner ratifies, and every operation is pure/injectable
// so the whole surface is unit-tested without real I/O. Persistence (proposals.json
// + the applied-change journal) lives in self-org.ts, which re-exports this model.

export const PROPOSAL_KINDS = ["hire", "routine", "reassign"] as const;
export const PROPOSAL_STATUSES = ["pending", "ratified", "rejected"] as const;

export const ProposalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PROPOSAL_KINDS),
  /** The org unit the change targets — a department.ts id (read-only reference). */
  departmentId: z.string().min(1),
  /** Human-readable specifics of the structural change. */
  detail: z.string().min(1),
  status: z.enum(PROPOSAL_STATUSES),
});
export type Proposal = z.infer<typeof ProposalSchema>;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type SelfOrgResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The derived signals the engine reacts to — already computed by the budget/OKR
 * engines and injected here (this module never decides over-budget/stalled
 * itself). `overBudgetDepartments` = department ids over their scope budget;
 * `stalledObjectives` = objective ids whose key results have not advanced.
 */
export type SelfOrgSignals = {
  overBudgetDepartments: string[];
  stalledObjectives: string[];
};

/** Deterministic, idempotent proposal id from its structural identity. Pure. */
export function proposalId(kind: ProposalKind, departmentId: string, detail: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return [kind, slug(departmentId), slug(detail)].filter(Boolean).join(":");
}

/**
 * Emit structural-change proposals from the injected signals. An over-budget
 * department → a "hire" proposal (capacity is the lever for cost overrun, e.g. a
 * specialist who lands the work cheaper); a stalled objective → a "routine"
 * proposal (a standing cadence to unstick it). Every proposal starts `pending` —
 * the engine proposes, it never applies. No signals → no proposals. Pure.
 */
export function proposeFromSignals(signals: SelfOrgSignals): Proposal[] {
  const out: Proposal[] = [];
  for (const departmentId of dedupe(signals.overBudgetDepartments)) {
    const id = departmentId.trim();
    if (!id) continue;
    const detail = `hire a role for over-budget department "${id}"`;
    out.push({ id: proposalId("hire", id, detail), kind: "hire", departmentId: id, detail, status: "pending" });
  }
  for (const objectiveId of dedupe(signals.stalledObjectives)) {
    const id = objectiveId.trim();
    if (!id) continue;
    const detail = `add a routine to unstick stalled objective "${id}"`;
    out.push({ id: proposalId("routine", id, detail), kind: "routine", departmentId: id, detail, status: "pending" });
  }
  return out;
}

/** Find a proposal by id in a list. Pure. */
export function getProposal(list: Proposal[], id: string): Proposal | undefined {
  return list.find((p) => p.id === id);
}

/** Pending proposals only, in queue order. Pure. */
export function pendingProposals(list: Proposal[]): Proposal[] {
  return list.filter((p) => p.status === "pending");
}

/** Side effect the owner authorises when ratifying — applies the org change. */
export type ApplyChange = (proposal: Proposal) => Promise<void>;

export type RatifyDeps = {
  /** Apply the structural change. Called ONLY on ratify, never on reject. */
  applyChange: ApplyChange;
};

/**
 * Ratify a pending proposal: mark it `ratified` AND apply the org change via the
 * injected `applyChange`. The owner ratifies — this is the only path that mutates
 * the org. Returns the updated list. Errors when unknown or not pending (a
 * ratified/rejected proposal is never re-applied). Effectful only via injection.
 */
export async function ratifyProposal(
  id: string,
  list: Proposal[],
  deps: RatifyDeps,
): Promise<SelfOrgResult<Proposal[]>> {
  const proposal = getProposal(list, id);
  if (!proposal) return { ok: false, error: `unknown proposal "${id}"` };
  if (proposal.status !== "pending") {
    return { ok: false, error: `proposal "${id}" is ${proposal.status}, not pending` };
  }
  await deps.applyChange(proposal);
  return { ok: true, value: setStatus(list, id, "ratified") };
}

/**
 * Reject a pending proposal: mark it `rejected` and apply NOTHING (no
 * `applyChange` call). Returns the updated list. Errors when unknown or not
 * pending. Pure. The engine's proposal is dropped without touching the org.
 */
export function rejectProposal(id: string, list: Proposal[]): SelfOrgResult<Proposal[]> {
  const proposal = getProposal(list, id);
  if (!proposal) return { ok: false, error: `unknown proposal "${id}"` };
  if (proposal.status !== "pending") {
    return { ok: false, error: `proposal "${id}" is ${proposal.status}, not pending` };
  }
  return { ok: true, value: setStatus(list, id, "rejected") };
}

/** Set one proposal's status, returning a new list. Pure. */
function setStatus(list: Proposal[], id: string, status: ProposalStatus): Proposal[] {
  return list.map((p) => (p.id === id ? { ...p, status } : p));
}

/** Merge freshly-proposed proposals into the queue, skipping ids already present. Pure. */
export function mergeProposals(existing: Proposal[], incoming: Proposal[]): Proposal[] {
  const taken = new Set(existing.map((p) => p.id));
  const additions = incoming.filter((p) => !taken.has(p.id));
  return [...existing, ...additions];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
