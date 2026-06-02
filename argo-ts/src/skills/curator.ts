import { readdir, readFile, rename, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { skillsDir, slugifySkillName } from "../store/home.js";
import { listSkills } from "./store.js";
import { parseSkill } from "./frontmatter.js";
import type { Skill } from "./types.js";

const SKILL_FILE = "SKILL.md";

// Hermes-derived lifecycle thresholds (see docs/prd.md / hermes-map): a skill
// untouched for 30 days is archived; an archived skill untouched for 90 days is
// removed. Overlap >= 0.6 Jaccard is reported (never auto-merged — destructive).
const STALE_DAYS = 30;
const REMOVE_DAYS = 90;
const OVERLAP_THRESHOLD = 0.6;
const MS_PER_DAY = 86_400_000;
const ARCHIVE_DIR = "_archive";

export type CurateResult = {
  archived: string[];
  removed: string[];
  overlaps: [string, string][];
};

/**
 * Background maintenance over the on-disk skill library. Archives stale active
 * skills, removes long-dead archived skills, and reports heavily-overlapping
 * active pairs for human review.
 *
 * Classifies active vs archived purely by `_archive` dir membership. Active
 * metadata (incl. `meta.updated`) comes from {@link listSkills} (which skips
 * `_archive`); archived metadata is read directly from each archived SKILL.md,
 * since listSkills never surfaces archived skills. A dir whose SKILL.md is
 * missing/unparseable is skipped (age unknowable → treated as not-stale).
 *
 * `now` is injected for deterministic tests; defaults to the current instant.
 */
export async function curate(
  opts: { env?: NodeJS.ProcessEnv; now?: string } = {},
): Promise<CurateResult> {
  const env = opts.env;
  const now = opts.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const root = skillsDir(env);

  const skills = await listSkills(env);
  const bySlug = new Map<string, Skill>();
  for (const skill of skills) bySlug.set(slugifySkillName(skill.meta.name), skill);

  const archivePath = join(root, ARCHIVE_DIR);
  const activeEntries = await listDirNames(root, ARCHIVE_DIR);
  const archivedEntries = await listDirNames(archivePath);

  const archived: string[] = [];
  for (const entry of activeEntries) {
    const skill = bySlug.get(entry);
    if (!skill || !isOlderThan(skill.meta.updated, STALE_DAYS, nowMs)) continue;
    await mkdir(archivePath, { recursive: true });
    await rename(join(root, entry), join(archivePath, entry));
    archived.push(entry);
  }

  const removed: string[] = [];
  for (const entry of archivedEntries) {
    // listSkills excludes _archive, so read the archived skill's metadata directly.
    const skill = await tryReadArchivedSkill(join(archivePath, entry));
    if (!skill || !isOlderThan(skill.meta.updated, REMOVE_DAYS, nowMs)) continue;
    await rm(join(archivePath, entry), { recursive: true, force: true });
    removed.push(entry);
  }

  // Overlap candidates = active skills still on disk after this run's archiving.
  const archivedSet = new Set(archived);
  const activeSkills = activeEntries
    .filter((entry) => !archivedSet.has(entry))
    .map((entry) => bySlug.get(entry))
    .filter((skill): skill is Skill => skill !== undefined);
  const overlaps = findOverlaps(activeSkills);

  return { archived, removed, overlaps };
}

/** Read+parse an archived skill's SKILL.md, returning null if missing/unparseable. */
async function tryReadArchivedSkill(skillDir: string): Promise<Skill | null> {
  try {
    return parseSkill(await readFile(join(skillDir, SKILL_FILE), "utf8"));
  } catch {
    return null;
  }
}

/** Directory names directly under `dir`, optionally excluding one name. Missing dir → []. */
async function listDirNames(dir: string, exclude?: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // dir doesn't exist yet (no skills, no _archive) — nothing to enumerate.
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && e.name !== exclude)
    .map((e) => e.name);
}

/**
 * True when `updated` parses to an instant older than `days` before `nowMs`.
 * Unparseable/empty timestamps are treated as not-stale so a malformed skill is
 * never archived or removed on bad data.
 */
function isOlderThan(updated: string, days: number, nowMs: number): boolean {
  const updatedMs = Date.parse(updated);
  if (Number.isNaN(updatedMs)) return false;
  return (nowMs - updatedMs) / MS_PER_DAY > days;
}

/**
 * Report active skill pairs whose combined name+description token sets overlap
 * heavily (Jaccard >= OVERLAP_THRESHOLD). Each unordered pair is emitted once,
 * with names sorted ascending so output is deterministic. Report only.
 */
function findOverlaps(skills: Skill[]): [string, string][] {
  const tokenSets = skills.map((skill) => ({
    name: skill.meta.name,
    tokens: tokenize(`${skill.meta.name} ${skill.meta.description}`),
  }));

  const pairs: [string, string][] = [];
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      if (!a || !b) continue;
      if (jaccard(a.tokens, b.tokens) >= OVERLAP_THRESHOLD) {
        const [first, second] = [a.name, b.name].sort((x, y) => x.localeCompare(y));
        pairs.push([first as string, second as string]);
      }
    }
  }
  return pairs;
}

/** Lowercase, split on non-alphanumerics, drop empties → a unique token set. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

/** Jaccard similarity (|∩| / |∪|) of two token sets; empty-vs-empty is 0. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
