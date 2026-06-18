import { searchSkills } from "./recall.js";
import type { Skill } from "./types.js";
import type { SkillIndexEntry } from "../prompt.js";

// SKILL-TASK-SUBSET (S2L / SWE-Skills-Bench finding: full skill text is often neutral or
// harmful, and wrong-skill injection collapses performance). Vanta injects the WHOLE skill
// index every turn. For a known task, inject only the top-k relevant skills (ranked by the
// same searchSkills scorer recall uses); the full catalog stays reachable via the recall
// tool. Default-safe: with no real task (interactive session / empty) or a small index, the
// full index is returned unchanged. Pure.

const DEFAULT_MAX = 12;
const INTERACTIVE = "interactive session";

// Strip common words so they don't create spurious skill matches (e.g. "and" hitting a
// skill that says "...and best practices").
const STOPWORDS = new Set(
  "the a an and or but for of to in on at with is are was were be this that these those my your our it its as by from".split(" "),
);

function toSkill(e: SkillIndexEntry): Skill {
  return { meta: { name: e.name, description: e.description, tags: [], created: "", updated: "" }, body: "" };
}

/** Drop stopwords + short tokens from the task before ranking. Pure. */
function contentTerms(task: string): string {
  return task.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w)).join(" ");
}

/** Keep only the top-k skills relevant to `task`. No real task or a small index → returns
 * the entries unchanged. A task with no relevant skills → [] (recall still serves the full
 * library on demand). Pure. */
export function selectSkillsForTask(entries: SkillIndexEntry[], task: string, max = DEFAULT_MAX): SkillIndexEntry[] {
  const t = task.trim();
  if (!t || t === INTERACTIVE || entries.length <= max) return entries;
  return searchSkills(contentTerms(t), entries.map(toSkill))
    .slice(0, max)
    .map((m) => ({ name: m.skill.meta.name, description: m.skill.meta.description }));
}
