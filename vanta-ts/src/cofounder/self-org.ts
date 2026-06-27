import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { PROPOSAL_KINDS, ProposalSchema, type Proposal } from "./proposal-model.js";

// COFOUNDER-SELF-ORGANIZATION (persistence) — the durable side of the engine:
// the proposal queue (~/.vanta/proposals.json) and the applied-change journal
// (~/.vanta/org-changes.json). The pure proposal model (schema, generation,
// ratify/reject lifecycle) lives in proposal-model.ts and is re-exported here so
// the module's public surface is unchanged. Store mirrors department.ts/okr.ts:
// zod at the boundary, tolerant reader, injected fs.

export * from "./proposal-model.js";

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
