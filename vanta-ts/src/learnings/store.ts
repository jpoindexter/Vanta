import { z } from "zod";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// LEARNINGS-INDEX: a per-project, typed insights index. A learning is a durable
// observation about THIS project — a gotcha, a convention, a locked decision, or
// a stable fact — captured once and surfaced into context at session start so the
// agent doesn't re-derive it. Stored as one tolerant JSON document at
// .vanta/learnings.json (project-scoped, like session-memory.md), so it travels
// with the repo rather than the global ~/.vanta store. Relevance/staleness/
// conflict scoring is pure and lives in relevance.ts; this file is the store.

const FILE = "learnings.json";

export const LEARNING_KINDS = ["gotcha", "convention", "decision", "fact"] as const;
export const LearningKindSchema = z.enum(LEARNING_KINDS);
export type LearningKind = z.infer<typeof LearningKindSchema>;

export const LearningSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: LearningKindSchema,
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** id of the learning that replaces this one (set by supersede). */
  supersededBy: z.string().optional(),
});
export type Learning = z.infer<typeof LearningSchema>;

// The on-disk document is an array; we validate per-element so one bad entry
// can't poison the whole file (tolerant reader contract).
const DocSchema = z.array(z.unknown());

export function learningsPath(dataDir: string): string {
  return join(dataDir, FILE);
}

/**
 * Tolerant reader: missing/corrupt file → []; within the file, elements that
 * fail validation are dropped (never throws). Latest record per id wins, so a
 * re-saved id replaces the stale one. Newest-updated first.
 */
export async function listLearnings(dataDir: string): Promise<Learning[]> {
  let raw: string;
  try {
    raw = await readFile(learningsPath(dataDir), "utf8");
  } catch {
    return [];
  }
  let arr: unknown[];
  try {
    const parsed = DocSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    arr = parsed.data;
  } catch {
    return [];
  }
  const byId = new Map<string, Learning>();
  for (const el of arr) {
    const r = LearningSchema.safeParse(el);
    if (r.success) byId.set(r.data.id, r.data);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function writeAll(dataDir: string, learnings: Learning[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(learningsPath(dataDir), JSON.stringify(learnings, null, 2), "utf8");
}

export type NewLearning = {
  text: string;
  kind: LearningKind;
  tags?: string[];
};

/** Append a learning. Returns the stored record (with id + timestamps). */
export async function addLearning(
  dataDir: string,
  input: NewLearning,
  now: number = Date.now(),
): Promise<Learning> {
  const entry: Learning = {
    id: randomUUID(),
    text: input.text,
    kind: input.kind,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const existing = await listLearnings(dataDir);
  await writeAll(dataDir, [entry, ...existing]);
  return entry;
}

/**
 * Mark `id` as superseded by `byId` (a newer learning that replaces it). Stamps
 * `supersededBy` + bumps `updatedAt`. Returns the updated record, or null when
 * `id` is unknown. Superseded entries are kept (audit trail) but excluded from
 * relevance surfacing.
 */
export async function supersede(
  dataDir: string,
  id: string,
  byId: string,
  now: number = Date.now(),
): Promise<Learning | null> {
  const all = await listLearnings(dataDir);
  const target = all.find((l) => l.id === id);
  if (!target) return null;
  const updated: Learning = { ...target, supersededBy: byId, updatedAt: now };
  await writeAll(
    dataDir,
    all.map((l) => (l.id === id ? updated : l)),
  );
  return updated;
}
