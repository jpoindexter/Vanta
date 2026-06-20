import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";

// COFOUNDER-SKILL-EXCHANGE — a cross-department exchange for skills/assets.
// One department PUBLISHES a skill (by slug — the exchange references skill
// identity, it does NOT re-store skill bodies; the SKILL.md still lives in the
// skills store) and another ADOPTS it. Adoption is SCOPED: only the adopting
// department's workers load the skill, never all departments globally. The
// publish/adopt/resolve model is pure + injectable; the store is ~/.vanta with
// a tolerant reader and injected fs/now, mirroring department.ts.

export const ExchangeEntrySchema = z.object({
  /** Skill slug — the identity referenced from the skills store, not its body. */
  skillId: z.string().min(1),
  /** The department id that published this skill to the exchange. */
  publishedBy: z.string().min(1),
  /** Department ids that have adopted it; only these load the skill (scoped). */
  adopters: z.array(z.string()).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type ExchangeEntry = z.infer<typeof ExchangeEntrySchema>;

export type ExchangeResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Find an exchange entry by skill id. Pure. */
export function getEntry(entries: ExchangeEntry[], skillId: string): ExchangeEntry | undefined {
  return entries.find((e) => e.skillId === skillId);
}

/** All entries, skill-id-sorted. Pure. */
export function listEntriesSorted(entries: ExchangeEntry[]): ExchangeEntry[] {
  return [...entries].sort((a, b) => a.skillId.localeCompare(b.skillId));
}

/**
 * Publish a skill to the exchange. Creates a new entry owned by `byDept`.
 * Idempotent on (skillId, publishedBy): re-publishing one's own entry is a
 * no-op that returns the list unchanged. Pure. Errors-as-values when the same
 * skill was already published by a DIFFERENT department.
 */
export function publishSkill(
  entries: ExchangeEntry[],
  skillId: string,
  byDept: string,
  now: Date = new Date(),
): ExchangeResult<ExchangeEntry[]> {
  const skill = skillId.trim();
  if (!skill) return { ok: false, error: "skillId is required" };
  const dept = byDept.trim();
  if (!dept) return { ok: false, error: "publishing departmentId is required" };

  const existing = getEntry(entries, skill);
  if (existing) {
    if (existing.publishedBy === dept) return { ok: true, value: entries };
    return { ok: false, error: `skill "${skill}" is already published by "${existing.publishedBy}"` };
  }
  const iso = now.toISOString();
  const entry: ExchangeEntry = {
    skillId: skill,
    publishedBy: dept,
    adopters: [],
    createdAt: iso,
    updatedAt: iso,
  };
  return { ok: true, value: [...entries, entry] };
}

/**
 * Adopt a published skill for a department. Adds `byDept` to the entry's
 * adopters (idempotent — re-adopting is a no-op). Pure. Errors when the skill
 * was never published. The publisher implicitly already has the skill, so it
 * does not need to adopt its own publication.
 */
export function adoptSkill(
  entries: ExchangeEntry[],
  skillId: string,
  byDept: string,
  now: Date = new Date(),
): ExchangeResult<ExchangeEntry[]> {
  const skill = skillId.trim();
  if (!skill) return { ok: false, error: "skillId is required" };
  const dept = byDept.trim();
  if (!dept) return { ok: false, error: "adopting departmentId is required" };

  const entry = getEntry(entries, skill);
  if (!entry) return { ok: false, error: `skill "${skill}" is not published to the exchange` };
  if (entry.adopters.includes(dept)) return { ok: true, value: entries };

  const updated: ExchangeEntry = { ...entry, adopters: [...entry.adopters, dept], updatedAt: now.toISOString() };
  return { ok: true, value: entries.map((e) => (e.skillId === skill ? updated : e)) };
}

/**
 * Resolve the skills a department's workers should load: the union of its OWN
 * skill bundle and the exchange skills it has adopted (incl. anything it itself
 * published). The scoping resolver — a published-but-not-adopted skill is
 * EXCLUDED for a non-adopting department, so binding is scoped, not global.
 * Deduped, sorted. Pure.
 */
export function skillsForDepartment(
  deptId: string,
  entries: ExchangeEntry[],
  deptOwnSkills: string[],
): string[] {
  const dept = deptId.trim();
  const owned = new Set(deptOwnSkills.map((s) => s.trim()).filter(Boolean));
  for (const entry of entries) {
    if (entry.publishedBy === dept || entry.adopters.includes(dept)) owned.add(entry.skillId);
  }
  return [...owned].sort((a, b) => a.localeCompare(b));
}

// ---- Store (~/.vanta/skill-exchange.json, tolerant reader, injected fs) ----

const StoreSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(z.unknown()).default([]),
});

export type ExchangeStoreFs = {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
};

const realFs: ExchangeStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  mkdir: async (p) => void (await mkdir(p, { recursive: true })),
};

export function skillExchangePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "skill-exchange.json");
}

/**
 * Read all exchange entries. Tolerant: a missing file → []; a corrupt file or a
 * malformed entry is dropped (never bricks the read), keeping the valid rows.
 */
export async function readExchange(
  env: NodeJS.ProcessEnv = process.env,
  fs: ExchangeStoreFs = realFs,
): Promise<ExchangeEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(skillExchangePath(env));
  } catch {
    return [];
  }
  let parsed: z.infer<typeof StoreSchema>;
  try {
    parsed = StoreSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
  const out: ExchangeEntry[] = [];
  for (const row of parsed.entries) {
    const ok = ExchangeEntrySchema.safeParse(row);
    if (ok.success) out.push(ok.data);
  }
  return out;
}

/** Persist the full exchange entry list, latest-wins. */
export async function writeExchange(
  entries: ExchangeEntry[],
  env: NodeJS.ProcessEnv = process.env,
  fs: ExchangeStoreFs = realFs,
): Promise<void> {
  await fs.mkdir(resolveVantaHome(env));
  await fs.writeFile(skillExchangePath(env), `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
}
