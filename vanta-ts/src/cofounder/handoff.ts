import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// COFOUNDER-DEPT-HANDOFF — a locked artifact in department A becomes another
// department's input context. A HANDOFF EDGE binds an approved work product to a
// downstream department; resolving a department's context follows every inbound
// edge and injects the upstream artifacts — but ONLY approved, still-resolvable
// ones (an unapproved or missing artifact contributes no context). The model +
// resolution are pure/injectable; the store mirrors department.ts / work-products.ts
// (~/.vanta JSON, zod boundary, tolerant reader, injected fs/now).
//
// References (binds, does not duplicate): workProductId → cofounder/work-products
// WorkProduct.id; fromDepartment/toDepartment → cofounder/department Department.id.

export const HandoffEdgeSchema = z.object({
  id: z.string().min(1),
  /** The handed-off artifact — references cofounder/work-products WorkProduct.id. */
  workProductId: z.string().min(1),
  /** The department that approved + declared the hand-off — Department.id. */
  fromDepartment: z.string().min(1),
  /** The receiving department — Department.id. Its next task gets the artifact. */
  toDepartment: z.string().min(1),
  createdAt: z.string().min(1),
});
export type HandoffEdge = z.infer<typeof HandoffEdgeSchema>;

export type HandoffResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Resolve a work product id to its injected artifact content, with its approval
 * state. Returns null when the artifact is unknown (already deleted / never
 * existed) — a missing artifact must yield no context, never an error.
 */
export type ResolvedArtifact = { content: string; approved: boolean };
export type GetArtifact = (workProductId: string) => ResolvedArtifact | null;

/** A declared hand-off: an approved artifact (`workProductId`) from `fromDept` to `toDept`. */
export type RecordHandoffSpec = {
  workProductId: string;
  fromDept: string;
  toDept: string;
};

/** Stable, unique id for a hand-off edge: `handoff-<n>`, n the next free index. Pure. */
export function deriveHandoffId(existing: HandoffEdge[]): string {
  const taken = new Set(existing.map((e) => e.id));
  let n = 1;
  while (taken.has(`handoff-${n}`)) n += 1;
  return `handoff-${n}`;
}

/**
 * Record a hand-off edge: department A declares that an approved artifact feeds
 * department B. Pure — the caller persists the result. Errors-as-values; a
 * department cannot hand off to itself (that's not a hand-off).
 */
export function recordHandoff(
  existing: HandoffEdge[],
  spec: RecordHandoffSpec,
  now: Date = new Date(),
): HandoffResult<HandoffEdge> {
  const wp = spec.workProductId.trim();
  if (!wp) return { ok: false, error: "workProductId is required" };

  const from = spec.fromDept.trim();
  if (!from) return { ok: false, error: "fromDepartment is required" };

  const to = spec.toDept.trim();
  if (!to) return { ok: false, error: "toDepartment is required" };

  if (from === to) return { ok: false, error: "a department cannot hand off to itself" };

  const edge: HandoffEdge = {
    id: deriveHandoffId(existing),
    workProductId: wp,
    fromDepartment: from,
    toDepartment: to,
    createdAt: now.toISOString(),
  };
  return { ok: true, value: edge };
}

/** One injected upstream artifact resolved for a department's next task. */
export type InjectedContext = {
  workProductId: string;
  fromDepartment: string;
  content: string;
};

/**
 * Resolve the injected context for a target department: every inbound hand-off
 * edge's upstream artifact, in edge order — but ONLY artifacts that resolve AND
 * are approved. An unapproved or missing (null) artifact contributes nothing, so
 * an un-locked or deleted work product silently yields no context. Pure.
 */
export function contextForDepartment(
  toDept: string,
  edges: HandoffEdge[],
  getArtifact: GetArtifact,
): InjectedContext[] {
  const target = toDept.trim();
  const out: InjectedContext[] = [];
  for (const edge of edges) {
    if (edge.toDepartment !== target) continue;
    const artifact = getArtifact(edge.workProductId);
    if (!artifact || !artifact.approved) continue;
    out.push({
      workProductId: edge.workProductId,
      fromDepartment: edge.fromDepartment,
      content: artifact.content,
    });
  }
  return out;
}

/** Find a hand-off edge by id in a list. Pure. */
export function getHandoff(list: HandoffEdge[], id: string): HandoffEdge | undefined {
  return list.find((e) => e.id === id);
}

/** All hand-off edges, newest-first by createdAt (id tie-break). Pure. */
export function listHandoffs(list: HandoffEdge[]): HandoffEdge[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

// ---- Store (~/.vanta/handoffs.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  handoffs: z.array(z.unknown()).default([]),
});

export type HandoffStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: HandoffStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function handoffsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "handoffs.json");
}

/**
 * Read all hand-off edges. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readHandoffs(
  env: NodeJS.ProcessEnv = process.env,
  fs: HandoffStoreFs = realFs,
): Promise<HandoffEdge[]> {
  let raw: string;
  try {
    raw = await fs.readFile(handoffsPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: HandoffEdge[] = [];
  for (const row of parsed.handoffs) {
    const ok = HandoffEdgeSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full hand-off list, latest-wins. */
export async function writeHandoffs(
  list: HandoffEdge[],
  env: NodeJS.ProcessEnv = process.env,
  fs: HandoffStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(handoffsPath(env), `${JSON.stringify({ version: 1, handoffs: list }, null, 2)}\n`);
}
