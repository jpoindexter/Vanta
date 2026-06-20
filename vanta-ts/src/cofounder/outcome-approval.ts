import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import type { WorkProduct, WorkProductResult } from "./work-products.js";

// COFOUNDER-OUTCOME-APPROVAL — an artifact-review approval gate over completed
// WORK PRODUCTS, distinct from the kernel's pre-ACTION Ask gate. The kernel gates
// an action *before* it runs (risk-classify a tool call); this gate reviews a
// finished OUTPUT *after* it lands (an owner approves or sends back a department's
// produced artifact). The queue logic is pure + injectable: list pending →
// request a revision (re-runs the producing task via an injected runner) → approve
// (flips the work-product's approved state via injected setApproved, which can
// unblock dependents). The revision log persists to ~/.vanta/artifact-reviews.json.
//
// References (binds, does not duplicate): workProductId → work-products WorkProduct.id;
// sourceTaskId → the producing team/tasks WorkerTask.id (what rerunTask re-runs).

/** One recorded revision request against a work product. */
export const RevisionRecordSchema = z.object({
  /** The work product sent back for revision — references work-products WorkProduct.id. */
  workProductId: z.string().min(1),
  /** Why the owner sent it back (free text). */
  reason: z.string().min(1),
  /** When the revision was requested (ISO 8601). */
  at: z.string().min(1),
});
export type RevisionRecord = z.infer<typeof RevisionRecordSchema>;

/** Injected effects for the review queue — fs/now plus the two cross-module hooks. */
export type ReviewDeps = {
  /** Flip a work product's approval flag (injected from work-products.setApproved). */
  setApproved: (id: string, approved: boolean) => Promise<WorkProductResult<WorkProduct[]>>;
  /** Re-run the task that produced an artifact (injected from the task runner). */
  rerunTask: (sourceTaskId: string) => Promise<void>;
  /** Append a revision record to the durable log. */
  appendRevision: (record: RevisionRecord) => Promise<void>;
  now?: () => Date;
};

/**
 * The not-yet-approved artifacts — the review queue. Pure. Newest-first by
 * createdAt (id tie-break) so the most recent output surfaces first.
 */
export function listPendingArtifacts(workProducts: WorkProduct[]): WorkProduct[] {
  return workProducts
    .filter((p) => !p.approved)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Approve a finished artifact: flip its approved state via the injected
 * setApproved (which can unblock dependents downstream). Returns the updated
 * work-product list. Errors-as-values (unknown id → setApproved's error).
 */
export async function approveArtifact(
  workProductId: string,
  deps: ReviewDeps,
): Promise<WorkProductResult<WorkProduct[]>> {
  const id = workProductId.trim();
  if (!id) return { ok: false, error: "workProductId is required" };
  return deps.setApproved(id, true);
}

/**
 * Request a revision of a finished artifact: record WHY it was sent back, then
 * re-run the producing task via the injected rerunTask (using the work product's
 * sourceTaskId). The artifact stays pending (unapproved) — it is the re-run's job
 * to produce a fresh one. Errors-as-values; the work product must exist in the list.
 */
export async function requestRevision(
  workProductId: string,
  reason: string,
  workProducts: WorkProduct[],
  deps: ReviewDeps,
): Promise<WorkProductResult<RevisionRecord>> {
  const id = workProductId.trim();
  if (!id) return { ok: false, error: "workProductId is required" };
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, error: "reason is required" };

  const product = workProducts.find((p) => p.id === id);
  if (!product) return { ok: false, error: `unknown work product "${id}"` };

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const record: RevisionRecord = { workProductId: id, reason: trimmedReason, at };
  await deps.appendRevision(record);
  // Re-run the task that produced this artifact, so a fresh output can be made.
  await deps.rerunTask(product.sourceTaskId);
  return { ok: true, value: record };
}

// ---- Store (~/.vanta/artifact-reviews.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  revisions: z.array(z.unknown()).default([]),
});

export type ReviewStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: ReviewStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function artifactReviewsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "artifact-reviews.json");
}

/**
 * Read the revision log. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readRevisions(
  env: NodeJS.ProcessEnv = process.env,
  fs: ReviewStoreFs = realFs,
): Promise<RevisionRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(artifactReviewsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: RevisionRecord[] = [];
  for (const row of parsed.revisions) {
    const ok = RevisionRecordSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full revision log, latest-wins. */
export async function writeRevisions(
  list: RevisionRecord[],
  env: NodeJS.ProcessEnv = process.env,
  fs: ReviewStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(artifactReviewsPath(env), `${JSON.stringify({ version: 1, revisions: list }, null, 2)}\n`);
}

/** Append one revision record to the durable log (read → push → write). */
export async function appendRevision(
  record: RevisionRecord,
  env: NodeJS.ProcessEnv = process.env,
  fs: ReviewStoreFs = realFs,
): Promise<void> {
  const existing = await readRevisions(env, fs);
  await writeRevisions([...existing, record], env, fs);
}
