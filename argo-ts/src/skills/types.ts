/** YAML frontmatter of a SKILL.md file. Flat string fields, Hermes-compatible. */
export type SkillMeta = {
  /** Human-readable skill name (also the slug source for the directory). */
  name: string;
  /** One-line summary — used by `recall` to decide relevance. */
  description: string;
  /** ISO 8601 timestamp the skill was first written. */
  created: string;
  /** ISO 8601 timestamp of the last update (curator uses this for staleness). */
  updated: string;
  /** Freeform tags for grouping and search. */
  tags: string[];
};

/** A parsed skill: frontmatter metadata + the markdown body after it. */
export type Skill = {
  meta: SkillMeta;
  body: string;
};

/** A recall hit: the skill plus its relevance score (higher = more relevant). */
export type SkillMatch = {
  skill: Skill;
  score: number;
};
