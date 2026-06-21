/**
 * VANTA-SKILL-USAGE-RANK — recency-weighted skill usage ranking.
 *
 * Pure: no fs, no clock — every fn takes `nowMs` (and the event log) injected.
 * The signal mirrors `modes/learning.ts` usage tracking (each invocation with a
 * timestamp), but here we RANK skills by a 7-day-half-life decayed usage score:
 * a skill used a lot RECENTLY outranks one used a lot long ago. No usage → an
 * empty ranking; `rankSkillsByUsage` then preserves the caller's order
 * (alphabetical-stable) so the existing prompt index is unchanged.
 *
 * Wiring (named, not done this round — mirror clarity-gate): the skill index
 * built in `prompt.ts` (`skillsTier(opts.skills)`, fed via `BuildPromptOptions.skills`)
 * renders skills in the order passed. The skill-selection site that assembles
 * those `SkillIndexEntry[]` — `skills/select.ts` (or `skills/recall.ts`'s ranker
 * when usage is the tiebreak) — would order names via `rankSkillsByUsage(names,
 * events, Date.now())` (or surface the hot set with `topUsedSkills`) BEFORE
 * passing them as `opts.skills`, so recently-used skills sit at the top of the
 * prompt index. The decay scoring stays here, pure; only the live call site
 * supplies real events + the real clock.
 */

/** One recorded skill invocation — the skill name and when it ran (epoch ms). */
export type UsageEvent = { skill: string; ts: number };

/** 7-day half-life in milliseconds: a 7-day-old event decays to ~half weight. */
export const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Decay weight for an event of the given age. `0.5 ** (ageMs / halfLifeMs)`:
 * age 0 → 1, age = one half-life → 0.5, age = two half-lives → 0.25, older →
 * smaller. Negative age (an event timestamped in the future relative to `nowMs`)
 * is clamped to weight 1 — it never exceeds a just-now event.
 */
export function decayWeight(ageMs: number, halfLifeMs: number = HALF_LIFE_MS): number {
  if (ageMs <= 0) return 1;
  return 0.5 ** (ageMs / halfLifeMs);
}

/**
 * Summed decayed weight of one skill's events as of `nowMs`. Events for other
 * skills are ignored; a skill with no events scores 0. Pure.
 */
export function usageScore(events: UsageEvent[], skill: string, nowMs: number): number {
  let score = 0;
  for (const event of events) {
    if (event.skill !== skill) continue;
    score += decayWeight(nowMs - event.ts);
  }
  return score;
}

/**
 * Order `skillNames` by recency-weighted usage score (desc) as of `nowMs`, ties
 * broken alphabetically (ascending). Skills with no usage all score 0 and so
 * fall to the tail in stable alphabetical order — i.e. no usage anywhere yields
 * the input names sorted alphabetically (the existing order), never a reshuffle.
 * Pure: input array is not mutated.
 */
export function rankSkillsByUsage(
  skillNames: string[],
  events: UsageEvent[],
  nowMs: number,
): string[] {
  const scored = skillNames.map((name) => ({ name, score: usageScore(events, name, nowMs) }));
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.map((s) => s.name);
}

/**
 * The top-`n` skill names by recency-weighted usage score as of `nowMs`. Derives
 * the candidate set from the events themselves (deduped). Unused skills never
 * appear (score 0 is excluded). `n` defaults to 5; `n <= 0` → empty.
 */
export function topUsedSkills(events: UsageEvent[], nowMs: number, n: number = 5): string[] {
  if (n <= 0) return [];
  const names = [...new Set(events.map((e) => e.skill))];
  const ranked = rankSkillsByUsage(names, events, nowMs).filter(
    (name) => usageScore(events, name, nowMs) > 0,
  );
  return ranked.slice(0, n);
}
