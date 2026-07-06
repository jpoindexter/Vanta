import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// COFOUNDER-WORK-PRODUCTS — a work-product is a department's durable, provenance-
// tagged ARTIFACT: the company Library, distinct from agent memory. A completed
// department task records ONE artifact carrying its provenance (which task
// produced it, which department owns it, which worker authored it) and an
// approval flag. The model + filters are pure; the store mirrors department.ts
// (~/.vanta JSON, zod boundary, tolerant reader, injected fs/now).
//
// References (binds, does not duplicate): departmentId → cofounder/department's
// Department.id; sourceTaskId → team/tasks WorkerTask.id; producedBy → team/store
// Worker.id.

/** What a department produces. Tagged for filtering / future kind-aware views. */
export const WORK_PRODUCT_KINDS = ["document", "code", "design", "decision", "asset", "report"] as const;
export type WorkProductKind = (typeof WORK_PRODUCT_KINDS)[number];

export const WorkProductSchema = z.object({
  id: z.string().min(1),
  /** The artifact itself — the produced content or a reference to it. */
  artifact: z.string().min(1),
  /** Artifact category, for kind-aware filtering. */
  kind: z.enum(WORK_PRODUCT_KINDS).default("document"),
  /** The completed task that produced this — references team/tasks WorkerTask.id. */
  sourceTaskId: z.string().min(1),
  /** The owning department — references cofounder/department Department.id. */
  departmentId: z.string().min(1),
  /** The worker that authored it — references team/store Worker.id. */
  producedBy: z.string().min(1),
  /** Whether the artifact has been approved (false until reviewed). */
  approved: z.boolean().default(false),
  createdAt: z.string().min(1),
});
export type WorkProduct = z.infer<typeof WorkProductSchema>;

export type WorkProductResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type RecordWorkProductSpec = {
  artifact: string;
  kind?: WorkProductKind;
  /** The completed task that produced this artifact. */
  sourceTaskId: string;
  /** The department this artifact belongs to. */
  departmentId: string;
  /** The worker that authored this artifact. */
  producedBy: string;
  /** Whether the artifact lands already approved (defaults to false → pending). */
  approved?: boolean;
};

/** Stable, unique id for a work product: `<departmentId>-wp-<n>`, n the next free index. Pure. */
export function deriveWorkProductId(existing: WorkProduct[], departmentId: string): string {
  const base = `${departmentId}-wp`;
  const taken = new Set(existing.map((p) => p.id));
  let n = 1;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Record a completed task's output as a durable, provenance-tagged artifact.
 * Pure — the caller persists the result. Every provenance field is required
 * (an artifact with no source task / department / author is not a work product).
 * Errors-as-values.
 */
export function recordWorkProduct(
  existing: WorkProduct[],
  spec: RecordWorkProductSpec,
  now: Date = new Date(),
): WorkProductResult<WorkProduct> {
  const artifact = spec.artifact.trim();
  if (!artifact) return { ok: false, error: "artifact is required" };

  const sourceTaskId = spec.sourceTaskId.trim();
  if (!sourceTaskId) return { ok: false, error: "sourceTaskId is required" };

  const departmentId = spec.departmentId.trim();
  if (!departmentId) return { ok: false, error: "departmentId is required" };

  const producedBy = spec.producedBy.trim();
  if (!producedBy) return { ok: false, error: "producedBy is required" };

  const product: WorkProduct = {
    id: deriveWorkProductId(existing, departmentId),
    artifact,
    kind: spec.kind ?? "document",
    sourceTaskId,
    departmentId,
    producedBy,
    approved: spec.approved ?? false,
    createdAt: now.toISOString(),
  };
  return { ok: true, value: product };
}

/** Find a work product by id in a list. Pure. */
export function getWorkProduct(list: WorkProduct[], id: string): WorkProduct | undefined {
  return list.find((p) => p.id === id);
}

/** All work products, newest-first by createdAt (id tie-break). Pure. */
export function listWorkProducts(list: WorkProduct[]): WorkProduct[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** Only the artifacts owned by a given department. Pure. */
export function byDepartment(list: WorkProduct[], departmentId: string): WorkProduct[] {
  return list.filter((p) => p.departmentId === departmentId);
}

/** Artifacts produced by one task (the task's linked work products). Pure. */
export function bySourceTask(list: WorkProduct[], taskId: string): WorkProduct[] {
  return list.filter((p) => p.sourceTaskId === taskId);
}

/** Artifacts filtered by approval state (true = approved, false = pending). Pure. */
export function byApproval(list: WorkProduct[], approved: boolean): WorkProduct[] {
  return list.filter((p) => p.approved === approved);
}

/**
 * Flip a work product's approval flag. Returns the updated list. Pure.
 * Idempotent — setting the current state is a no-op. Errors when id is unknown.
 */
export function setApproved(
  list: WorkProduct[],
  id: string,
  approved: boolean,
): WorkProductResult<WorkProduct[]> {
  const product = getWorkProduct(list, id);
  if (!product) return { ok: false, error: `unknown work product "${id}"` };
  if (product.approved === approved) return { ok: true, value: list };
  return { ok: true, value: list.map((p) => (p.id === id ? { ...p, approved } : p)) };
}

// ---- Store (~/.vanta/work-products.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  workProducts: z.array(z.unknown()).default([]),
});

export type WorkProductStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: WorkProductStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function workProductsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "work-products.json");
}

/**
 * Read all work products. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readWorkProducts(
  env: NodeJS.ProcessEnv = process.env,
  fs: WorkProductStoreFs = realFs,
): Promise<WorkProduct[]> {
  let raw: string;
  try {
    raw = await fs.readFile(workProductsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: WorkProduct[] = [];
  for (const row of parsed.workProducts) {
    const ok = WorkProductSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full work-product list, latest-wins. */
export async function writeWorkProducts(
  list: WorkProduct[],
  env: NodeJS.ProcessEnv = process.env,
  fs: WorkProductStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(workProductsPath(env), `${JSON.stringify({ version: 1, workProducts: list }, null, 2)}\n`);
}
