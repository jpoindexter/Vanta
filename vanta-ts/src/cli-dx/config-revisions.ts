import { z } from "zod";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

// PCLIP-CONFIG-REVISION — versioned .env history + rollback. Every config write
// (setConfig/migrateConfig) snapshots the content it is about to REPLACE, so the
// jsonl accumulates exactly the prior states; the latest entry is "what .env
// looked like right before the last change" — the natural undo-one-step target.
// Tolerant reads (a corrupt line is dropped, never wedges rollback), matching
// the budget/store.ts style of small per-project JSON/JSONL stores under `.vanta/`.

const RevisionSchema = z.object({
  rev: z.number().int().positive(),
  ts: z.string(),
  content: z.string(),
  note: z.string().optional(),
});
export type ConfigRevision = z.infer<typeof RevisionSchema>;

function revisionsPath(dataDir: string): string {
  return join(dataDir, "config-revisions.jsonl");
}

/** All recorded revisions, oldest first. Corrupt/malformed lines are dropped. */
export async function listRevisions(dataDir: string): Promise<ConfigRevision[]> {
  let raw: string;
  try {
    raw = await readFile(revisionsPath(dataDir), "utf8");
  } catch {
    return [];
  }
  const out: ConfigRevision[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = RevisionSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      /* one corrupt line must not lose the rest of the history */
    }
  }
  return out;
}

/** Record `content` (the state about to be replaced) as the next revision. */
export async function appendRevision(
  dataDir: string,
  content: string,
  note?: string,
  now: Date = new Date(),
): Promise<ConfigRevision> {
  const existing = await listRevisions(dataDir);
  const rev = (existing.at(-1)?.rev ?? 0) + 1;
  const revision: ConfigRevision = { rev, ts: now.toISOString(), content, ...(note ? { note } : {}) };
  await mkdir(dataDir, { recursive: true });
  await appendFile(revisionsPath(dataDir), `${JSON.stringify(revision)}\n`, "utf8");
  return revision;
}

/** A specific numbered revision, or null if it doesn't exist. */
export async function getRevision(dataDir: string, rev: number): Promise<ConfigRevision | null> {
  return (await listRevisions(dataDir)).find((r) => r.rev === rev) ?? null;
}

/** The rollback target when no revision number is given: the most recently
 *  recorded snapshot (undo the last change). Null if there's no history yet. */
export async function latestRevision(dataDir: string): Promise<ConfigRevision | null> {
  const all = await listRevisions(dataDir);
  return all.at(-1) ?? null;
}
