import type { Skill, SkillMatch } from "./types.js";

// Weights applied per query token found in each field. name is the strongest
// relevance signal, body the weakest, mirroring how a curator skims a skill.
const WEIGHT_NAME = 3;
const WEIGHT_DESCRIPTION = 2;
const WEIGHT_TAGS = 2;
const WEIGHT_BODY = 1;

// Single-character tokens (e.g. "a") are too noisy to carry signal, so drop them.
const MIN_TOKEN_LENGTH = 2;

/**
 * Rank skills against a free-text query by case-insensitive substring matching.
 *
 * Pure: no fs, no clock — the caller supplies the skills to rank. Tokens are
 * lowercased, split on non-alphanumerics, and short tokens are dropped. Each
 * token contributes to a skill's score per field it appears in (name 3,
 * description 2, tags 2, body 1). Skills scoring zero are excluded; results are
 * sorted by score descending, ties broken by name ascending for determinism.
 */
export function searchSkills(query: string, skills: Skill[]): SkillMatch[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matches: SkillMatch[] = [];
  for (const skill of skills) {
    const score = scoreSkill(skill, tokens);
    if (score > 0) matches.push({ skill, score });
  }

  matches.sort(
    (a, b) =>
      b.score - a.score || a.skill.meta.name.localeCompare(b.skill.meta.name),
  );
  return matches;
}

/** Lowercase, split on non-alphanumerics, drop tokens shorter than 2 chars. */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function scoreSkill(skill: Skill, tokens: string[]): number {
  const { meta, body } = skill;
  const name = meta.name.toLowerCase();
  const description = meta.description.toLowerCase();
  const tags = meta.tags.map((tag) => tag.toLowerCase());
  const lowerBody = body.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (name.includes(token)) score += WEIGHT_NAME;
    if (description.includes(token)) score += WEIGHT_DESCRIPTION;
    if (tags.some((tag) => tag.includes(token))) score += WEIGHT_TAGS;
    if (lowerBody.includes(token)) score += WEIGHT_BODY;
  }
  return score;
}
