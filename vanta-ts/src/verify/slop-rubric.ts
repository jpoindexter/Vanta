// The static rubric behind the slop diagnostic (slop-diagnostic.ts): the
// word/phrase vocabulary, the per-word density thresholds, and the token
// patterns that decide what counts as "concrete". Split out for the size
// gate; all values are heuristic (tuned to the clear cases, not over-fit).

// --- word/phrase lists (small + documented; heuristic, not exhaustive) ---

/** Weasel words that hedge a claim without adding information. */
export const HEDGE_TERMS = [
  "might",
  "perhaps",
  "generally",
  "it depends",
  "in some cases",
  "arguably",
  "to some extent",
  "more or less",
  "kind of",
  "sort of",
];

/** Boilerplate filler phrases that pad without saying anything. */
export const FILLER_PHRASES = [
  "it's important to note",
  "it is important to note",
  "at the end of the day",
  "when it comes to",
  "in today's world",
  "needless to say",
  "the fact of the matter is",
];

/** Empty corporate buzzwords. */
export const BUZZWORDS = [
  "synergy",
  "leverage",
  "holistic",
  "paradigm",
  "robust",
  "seamless",
  "cutting-edge",
  "best-in-class",
  "next-generation",
  "game-changer",
];

// --- thresholds (heuristic — tuned to the clear cases, not over-fit) ---

export const HEDGE_FAIL_AT = 0.04; // hedge terms per word
export const FILLER_FAIL_AT = 0.015; // filler phrases per word
export const BUZZWORD_FAIL_AT = 0.03; // buzzwords per word
export const RESTATE_FAIL_AT = 0.6; // prompt-token overlap fraction
export const SLOP_SCORE_CUTOFF = 0.34; // isSlop when slopScore exceeds this
export const FAILED_TEST_CUTOFF = 3; // ...or when at least this many tests fail
export const DENSITY_NORM = 0.05; // density that maps to a full 1.0 signal

export const WORD_RE = /[a-z0-9][a-z0-9'-]*/gi;
export const NUMBER_RE = /\d/;
export const PROPER_NOUN_RE = /(?:^|[^.!?]\s)([A-Z][a-zA-Z]+)/; // Capitalized, not sentence-start-only
export const CODE_TOKEN_RE = /`[^`]+`|\b[\w/-]+\.[a-z]{1,5}\b|\b\w+\([^)]*\)|\b\w+_\w+\b/;
