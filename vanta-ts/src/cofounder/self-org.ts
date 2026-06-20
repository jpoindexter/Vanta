import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// COFOUNDER-SELF-ORGANIZATION — the engine proposes structural org changes, the
// owner ratifies. When a department is over-budget the engine emits a "hire"
// proposal; when an objective is stalled it emits a "routine" proposal. Proposals
// land in a queue (pending) and NEVER apply unilaterally — `ratifyProposal` marks
// one ratified AND calls the injected `applyChange`; `rejectProposal` marks it
// rejected and applies nothing. Proposal generation + ratify/reject are
// pure/injectable so the whole surface is unit-tested without real I/O. Store
// mirrors department.ts/okr.ts: zod at the boundary, tolerant reader, injected fs.

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

// ---- Store (~/.vanta/proposals.json, tolerant reader, injected fs/now) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  proposals: z.array(z.unknown()).default([]),
});

export type ProposalStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: ProposalStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function proposalsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "proposals.json");
}

/**
 * Read all proposals. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readProposals(
  env: NodeJS.ProcessEnv = process.env,
  fs: ProposalStoreFs = realFs,
): Promise<Proposal[]> {
  let raw: string;
  try {
    raw = await fs.readFile(proposalsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: Proposal[] = [];
  for (const row of parsed.proposals) {
    const ok = ProposalSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full proposal list, latest-wins. */
export async function writeProposals(
  list: Proposal[],
  env: NodeJS.ProcessEnv = process.env,
  fs: ProposalStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(proposalsPath(env), `${JSON.stringify({ version: 1, proposals: list }, null, 2)}\n`);
}

// ---- Applied-change journal (~/.vanta/org-changes.json) ----
// The durable record of structural changes the owner ratified. A ratified
// proposal IS the org change; appending here makes the application auditable.

export const AppliedChangeSchema = z.object({
  proposalId: z.string().min(1),
  kind: z.enum(PROPOSAL_KINDS),
  departmentId: z.string().min(1),
  detail: z.string().min(1),
  appliedAt: z.string().min(1),
});
export type AppliedChange = z.infer<typeof AppliedChangeSchema>;

const ChangeStoreSchema = z.object({
  version: z.literal(1).default(1),
  changes: z.array(z.unknown()).default([]),
});

export function orgChangesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "org-changes.json");
}

/** Read the applied-change journal. Tolerant: missing/corrupt/malformed → drop. */
export async function readAppliedChanges(
  env: NodeJS.ProcessEnv = process.env,
  fs: ProposalStoreFs = realFs,
): Promise<AppliedChange[]> {
  let raw: string;
  try {
    raw = await fs.readFile(orgChangesPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof ChangeStoreSchema>;
  try {
    parsed = ChangeStoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: AppliedChange[] = [];
  for (const row of parsed.changes) {
    const ok = AppliedChangeSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Append a ratified proposal's change to the journal (durable application). */
export async function appendAppliedChange(
  proposal: Proposal,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
  fs: ProposalStoreFs = realFs,
): Promise<void> {
  const existing = await readAppliedChanges(env, fs);
  const change: AppliedChange = {
    proposalId: proposal.id,
    kind: proposal.kind,
    departmentId: proposal.departmentId,
    detail: proposal.detail,
    appliedAt: now.toISOString(),
  };
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(orgChangesPath(env), `${JSON.stringify({ version: 1, changes: [...existing, change] }, null, 2)}\n`);
}
