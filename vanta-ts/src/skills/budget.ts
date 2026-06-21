import { z } from "zod";
import { estTokens } from "../compress/types.js";

// VANTA-SETTINGS-SKILL — operator-bounded skill-index context budget.
//
// The skill index in the system prompt (`prompt.ts skillsTier`) advertises every
// learned skill as one clipped line. As the library grows that index eats prompt
// budget; this is the SETTINGS-side knob letting the OPERATOR bound how much
// context the skill index consumes — WITHOUT deleting any skill from disk.
//
// Standalone schema (no import from `settings/store.ts`) so store.ts can fold the
// `SkillSettingsSchema` into `SettingsSchema` without a circular import — mirrors
// how `memory-settings.ts` / `mcp-access.ts` / `skills/overrides.ts` are structured.
//
// Three composable caps:
//   - `maxSkills`           → keep at most N skills (the highest-ranked first N).
//   - `descriptionMaxChars` → clip each skill description to N chars + an ellipsis.
//   - `contextBudgetTokens` → after the count/clip caps, drop skills from the TAIL
//                             (the lowest-ranked) until the total estimated token
//                             cost of the rendered index is at/under the budget.
//
// PURE + deterministic: a zod schema + two pure transforms. No I/O, no LLM, no clock.
//
// Default-safe: with NO `skills` settings the result is the input list with each
// description clipped to DEFAULT_DESC_MAX_CHARS (100) — byte-identical to the
// existing `prompt.ts trimSkillDesc` behavior (first line, 100-char clip + ellipsis),
// so an absent settings block reproduces today's index exactly.
//
// Not wired into the live prompt this round (delivered as the pure layer + tests).
// NAMED wire-up point: `prompt.ts skillsTier(opts.skills)` builds the index from
// the ranked `SkillIndexEntry[]` (ranked upstream via `skills/usage-rank.ts`
// `rankSkillsByUsage`). The skill-selection site that assembles those entries would
// call `applySkillBudget(ranked, settings.skills)` BEFORE passing them as
// `opts.skills`, and `skillsTier` would render `clipSkillDescription(desc, max)`
// instead of the hard-coded `trimSkillDesc`. The trimming stays here, pure; only
// the live call site supplies the real ranked list + the operator's settings.

/** The operator's skill-index budget block on settings.json. Every field absent =
 *  today's behavior (all skills, default 100-char clip). */
export const SkillSettingsSchema = z
  .object({
    /** Cap the total estimated tokens the rendered skill index may consume in the
     *  prompt. After count/clip caps, skills are dropped from the tail (lowest-
     *  ranked) until the index fits; at least one skill is always kept if any. */
    contextBudgetTokens: z.number().int().positive().optional(),
    /** Cap how many skills enter the index — the highest-ranked first N are kept. */
    maxSkills: z.number().int().positive().optional(),
    /** Clip each skill description to this many characters (+ an ellipsis). */
    descriptionMaxChars: z.number().int().positive().optional(),
  })
  .strict();

export type SkillSettings = z.infer<typeof SkillSettingsSchema>;

/** One ranked skill entry — name + description, in include order (best first). */
export type RankedSkill = { name: string; description: string };

/** Default clip width — matches `prompt.ts trimSkillDesc` so an absent
 *  `descriptionMaxChars` reproduces today's index exactly. */
export const DEFAULT_DESC_MAX_CHARS = 100;

/** The ellipsis appended to a clipped description (single char, like trimSkillDesc). */
const ELLIPSIS = "…";

/**
 * Clip a skill description to one line of at most `max` characters, appending an
 * ellipsis when it overflows (the ellipsis replaces the last kept char so the
 * total stays `max` long — identical to `trimSkillDesc`'s `slice(0, max-1) + "…"`).
 * Only the first line is kept (multi-line descriptions collapse to their head).
 * `max` defaults to DEFAULT_DESC_MAX_CHARS so an unset cap preserves today's clip.
 * Pure; a non-positive `max` is treated as the default (never produces an empty line).
 */
export function clipSkillDescription(desc: string, max: number = DEFAULT_DESC_MAX_CHARS): string {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_DESC_MAX_CHARS;
  const line = (desc.split("\n")[0] ?? "").trim();
  if (line.length <= limit) return line;
  return `${line.slice(0, limit - 1)}${ELLIPSIS}`;
}

/** The rendered cost of one index line, mirroring `skillsTier`'s `- name: desc`
 *  shape so the token estimate reflects what actually lands in the prompt. */
function renderedLine(skill: RankedSkill): string {
  return `- ${skill.name}: ${skill.description}`;
}

/** Summed estimated tokens of the rendered index for a list of clipped skills. */
function indexTokens(skills: RankedSkill[]): number {
  if (!skills.length) return 0;
  return estTokens(skills.map(renderedLine).join("\n"));
}

/**
 * Apply the operator's skill-index budget to a RANKED skill list (best first),
 * returning the included subset. Deterministic, pure, input not mutated:
 *   1. `maxSkills`           — keep the highest-ranked first N (slice the head).
 *   2. `descriptionMaxChars` — clip each kept description (default 100 when unset).
 *   3. `contextBudgetTokens` — drop from the TAIL until the rendered index fits the
 *                              budget; always keep at least one skill when any exist
 *                              (a budget too small for even one skill still returns
 *                              that single highest-ranked skill).
 * Absent settings (`undefined`/`{}`) → every input skill, each clipped to the
 * default width — byte-identical to today's index.
 */
export function applySkillBudget(
  rankedSkills: readonly RankedSkill[],
  settings?: SkillSettings,
): RankedSkill[] {
  const capped = settings?.maxSkills != null
    ? rankedSkills.slice(0, settings.maxSkills)
    : rankedSkills.slice();
  const clipped: RankedSkill[] = capped.map((s) => ({
    name: s.name,
    description: clipSkillDescription(s.description, settings?.descriptionMaxChars),
  }));
  const budget = settings?.contextBudgetTokens;
  if (budget == null || !clipped.length) return clipped;
  let kept = clipped;
  while (kept.length > 1 && indexTokens(kept) > budget) {
    kept = kept.slice(0, -1);
  }
  return kept;
}
