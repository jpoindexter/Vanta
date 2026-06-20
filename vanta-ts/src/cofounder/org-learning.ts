import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// COFOUNDER-ORG-LEARNING — completed work becomes reusable playbooks. When a
// department has finished >=3 tasks of one recurring type, that body of work is
// distilled (PURELY) into a Playbook: the deduped steps observed across those
// outcomes plus the task ids it came from. A later task of the same type in the
// same department retrieves the matching playbook as injected context, so the
// org reuses what it already learned instead of re-deriving it.
//
// This mirrors department.ts's store style (zod at the persistence boundary,
// tolerant reader, injected fs/now). It does NOT extend learnings/* — that is a
// per-project insights index; playbooks are department-scoped org memory and
// live in the global ~/.vanta store alongside departments.json.

/** The minimum completed outcomes of one taskType before a playbook is formed. */
export const PLAYBOOK_MIN_OUTCOMES = 3;

/** A single finished unit of work in a department, the raw material for extraction. */
export const CompletedOutcomeSchema = z.object({
  taskId: z.string().min(1),
  /** The recurring task type this outcome belongs to, e.g. "weekly-report". */
  taskType: z.string().min(1),
  /** Ordered steps the completed work went through. */
  steps: z.array(z.string()).default([]),
});
export type CompletedOutcome = z.infer<typeof CompletedOutcomeSchema>;

export const PlaybookSchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  taskType: z.string().min(1),
  /** The deduped, order-preserved steps distilled from the source outcomes. */
  steps: z.array(z.string()).default([]),
  /** The task ids the playbook was extracted from (provenance). */
  fromTaskIds: z.array(z.string()).default([]),
});
export type Playbook = z.infer<typeof PlaybookSchema>;

/** A stable, collision-resistant playbook id for a department + task type. Pure. */
export function playbookId(departmentId: string, taskType: string): string {
  return `pb:${departmentId}:${taskType}`;
}

/**
 * Distil completed outcomes of one taskType into a Playbook. Returns a Playbook
 * ONLY when at least PLAYBOOK_MIN_OUTCOMES outcomes of that exact taskType (in
 * this department) are present — below the threshold there is no recurring
 * pattern to capture, so it returns null. The steps are the union of every
 * source outcome's steps, deduped with first-seen order preserved. Pure.
 */
export function extractPlaybook(
  departmentId: string,
  taskType: string,
  completedOutcomes: CompletedOutcome[],
): Playbook | null {
  const dept = departmentId.trim();
  const type = taskType.trim();
  if (!dept || !type) return null;

  const matching = completedOutcomes.filter((o) => o.taskType === type);
  if (matching.length < PLAYBOOK_MIN_OUTCOMES) return null;

  return {
    id: playbookId(dept, type),
    departmentId: dept,
    taskType: type,
    steps: dedupe(matching.flatMap((o) => o.steps).map((s) => s.trim()).filter(Boolean)),
    fromTaskIds: dedupe(matching.map((o) => o.taskId)),
  };
}

/**
 * Insert/replace a playbook in a list (latest-wins on the same dept+taskType id).
 * Returns the updated list. Pure — the caller persists it. Errors-as-values.
 */
export function recordPlaybook(
  list: Playbook[],
  playbook: Playbook,
): { ok: true; value: Playbook[] } | { ok: false; error: string } {
  const parsed = PlaybookSchema.safeParse(playbook);
  if (!parsed.success) return { ok: false, error: "invalid playbook" };
  const pb = parsed.data;
  const without = list.filter((p) => p.id !== pb.id);
  return { ok: true, value: [...without, pb] };
}

/**
 * Find the playbook a new task can reuse: the one for the same department AND
 * the same taskType, or null on a miss. Pure — the caller injects it as context.
 */
export function matchPlaybook(
  departmentId: string,
  taskType: string,
  playbooks: Playbook[],
): Playbook | null {
  const dept = departmentId.trim();
  const type = taskType.trim();
  if (!dept || !type) return null;
  return playbooks.find((p) => p.departmentId === dept && p.taskType === type) ?? null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

// ---- Store (~/.vanta/playbooks.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  playbooks: z.array(z.unknown()).default([]),
});

export type PlaybookStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: PlaybookStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function playbooksPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "playbooks.json");
}

/**
 * Read all playbooks. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readPlaybooks(
  env: NodeJS.ProcessEnv = process.env,
  fs: PlaybookStoreFs = realFs,
): Promise<Playbook[]> {
  let raw: string;
  try {
    raw = await fs.readFile(playbooksPath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: Playbook[] = [];
  for (const row of parsed.playbooks) {
    const ok = PlaybookSchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full playbook list, latest-wins. */
export async function writePlaybooks(
  list: Playbook[],
  env: NodeJS.ProcessEnv = process.env,
  fs: PlaybookStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(playbooksPath(env), `${JSON.stringify({ version: 1, playbooks: list }, null, 2)}\n`);
}
