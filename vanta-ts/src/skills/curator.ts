import { readdir, readFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
// NEEDS-SPECIAL: curator archives a skill by `rename`-ing its whole DIRECTORY
// into `_archive` and enumerates directories with `isDirectory()`. The
// file-granular MemoryStore port has no directory-move or directory-typed list,
// and its `remove` is non-recursive (would leave an empty dir behind, breaking
// the reversible-move contract the tests assert). So the directory ops stay on
// the fs; `skillsDir` here is the PURE path resolver, not persistence logic.
import { skillsDir } from "../store/home.js";
import { slugifySkillName } from "../store/slug.js";
import { listSkills, LEARNED_TAG } from "./store.js";
import { parseSkill } from "./frontmatter.js";
import type { Skill } from "./types.js";

const SKILL_FILE = "SKILL.md";

// Lifecycle thresholds. A skill untouched for 30 days is a stale
// candidate; a learned skill is archived (reversible move to _archive), a
// hand-authored one is only REPORTED. A long-archived skill (90 days) is
// reported as prunable but NEVER auto-deleted — auto-delete is irreversible data
// loss the reference design (and Vanta's Rule Zero) forbid. Overlap >= 0.6
// Jaccard is reported, never auto-merged.
const STALE_DAYS = 30;
const PRUNE_REPORT_DAYS = 90;
const OVERLAP_THRESHOLD = 0.6;
const MS_PER_DAY = 86_400_000;
const ARCHIVE_DIR = "_archive";

export type CurateResult = {
  /** Stale + learned (provenance-tagged) → moved to `_archive` (recoverable). */
  archived: string[];
  /** Stale but hand-authored → reported only; never auto-moved. */
  staleUnowned: string[];
  /** Long-archived → reported for manual prune; NEVER auto-deleted. */
  prunable: string[];
  /** Heavily-overlapping active pairs for human review; never auto-merged. */
  overlaps: [string, string][];
};

/**
 * Background maintenance over the on-disk skill library. NON-DESTRUCTIVE by
 * design: it archives only stale skills the self-improvement loop authored
 * (tagged {@link LEARNED_TAG}), reports stale hand-authored skills without
 * touching them, reports long-archived skills as prunable without deleting, and
 * reports heavily-overlapping active pairs. Nothing is ever removed.
 *
 * Active vs archived is classified by `_archive` dir membership. Active metadata
 * comes from {@link listSkills} (which skips `_archive`); archived metadata is
 * read directly. A dir whose SKILL.md is missing/unparseable is skipped.
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
  const staleUnowned: string[] = [];
  for (const entry of activeEntries) {
    const skill = bySlug.get(entry);
    if (!skill || !isOlderThan(skill.meta.updated, STALE_DAYS, nowMs)) continue;
    if (!skill.meta.tags.includes(LEARNED_TAG)) {
      // Hand-authored — surface it, but never move a skill the user wrote.
      staleUnowned.push(entry);
      continue;
    }
    await mkdir(archivePath, { recursive: true });
    await rename(join(root, entry), join(archivePath, entry));
    archived.push(entry);
  }

  // Long-archived skills are REPORTED, never deleted (Rule Zero).
  const prunable: string[] = [];
  for (const entry of archivedEntries) {
    const skill = await tryReadArchivedSkill(join(archivePath, entry));
    if (skill && isOlderThan(skill.meta.updated, PRUNE_REPORT_DAYS, nowMs)) {
      prunable.push(entry);
    }
  }

  // Overlap candidates = active skills still on disk after this run's archiving.
  const archivedSet = new Set(archived);
  const activeSkills = activeEntries
    .filter((entry) => !archivedSet.has(entry))
    .map((entry) => bySlug.get(entry))
    .filter((skill): skill is Skill => skill !== undefined);
  const overlaps = findOverlaps(activeSkills);

  return { archived, staleUnowned, prunable, overlaps };
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
