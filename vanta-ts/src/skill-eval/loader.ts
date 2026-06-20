import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SKILL_EVAL_TASKS, SkillEvalTaskSchema, type SkillEvalTask } from "./corpus.js";

// SKILL-EVAL-CORPUS loader — zod-validate the corpus and expose the typed tasks.
// Mirrors mem-eval's loader/validation pattern. A referenced skill slug that is
// missing from the bundled skills-library is a WARNING (best-effort cross-check),
// not a crash — the corpus stays usable; the warning flags drift.

const here = dirname(fileURLToPath(import.meta.url));
/** vanta-ts/skills-library — bundled skill slugs live as <slug>/SKILL.md. */
const SKILLS_LIBRARY_DIR = resolve(here, "..", "..", "skills-library");

export type SkillEvalCorpus = {
  tasks: SkillEvalTask[];
  /** Non-fatal problems (e.g. a referenced slug not found on disk). */
  warnings: string[];
};

/** True when `<skills-library>/<slug>/SKILL.md` exists. Pure-ish (fs read). */
function slugInstalled(slug: string, libraryDir: string): boolean {
  return existsSync(join(libraryDir, slug, "SKILL.md"));
}

/**
 * Validate SKILL_EVAL_TASKS via zod and return the typed corpus. Throws (via
 * zod) on an invalid task — a corpus authoring error must fail loudly. Optionally
 * cross-checks each referenced slug against the bundled library; a missing slug
 * is reported as a warning, never an error.
 */
export function loadSkillEvalCorpus(opts: { libraryDir?: string } = {}): SkillEvalCorpus {
  const tasks = z.array(SkillEvalTaskSchema).parse(SKILL_EVAL_TASKS);
  const libraryDir = opts.libraryDir ?? SKILLS_LIBRARY_DIR;
  const warnings: string[] = [];
  if (existsSync(libraryDir)) {
    for (const task of tasks) {
      if (!slugInstalled(task.skillSlug, libraryDir)) {
        warnings.push(`task "${task.id}" references unknown skill slug "${task.skillSlug}"`);
      }
    }
  } else {
    warnings.push(`skills-library not found at ${libraryDir}; skipped slug cross-check`);
  }
  return { tasks, warnings };
}

/** The unique set of skill slugs the corpus references. */
export function skillSlugsInCorpus(): string[] {
  return [...new Set(SKILL_EVAL_TASKS.map((t) => t.skillSlug))];
}

/** Exposed for tests that want to assert against the real bundled library. */
export const skillsLibraryDir = SKILLS_LIBRARY_DIR;
