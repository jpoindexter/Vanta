/** YAML frontmatter of a SKILL.md file. Flat string fields, portable across agent runtimes. */
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
  /** When true, a recalled body is dropped from history after the turn (lean context). */
  volatile?: boolean;
  /** SKILL-TRIGGERS — declared harness events that should auto-surface this skill
   *  (compiled into hooks). Empty/absent = relevance-fired only (the default). */
  triggers?: SkillTrigger[];
};

/**
 * One declarative firing trigger on a skill (SKILL-TRIGGERS). Forward-compatible:
 * an unknown `event` parses fine but is skipped by the compiler — never breaks.
 */
export type SkillTrigger = {
  /** Harness event name (validated against the known event set by the compiler). */
  event: string;
  /** PreToolUse/PostToolUse: regex on the tool name (→ toolNamePattern). */
  match?: string;
  /** Compact condition; v1 supports only "errors>=N" (→ onError on PostToolUse). */
  when?: string;
  /** PreToolUse firing mode. "block" makes it a hard gate; default is advisory. */
  action?: "advisory" | "block";
  /** Override the default recall note text. */
  note?: string;
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
