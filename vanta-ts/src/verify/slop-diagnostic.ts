// COFOUNDER-ANTI-SLOP: a 5-test slop DIAGNOSTIC — fast, deterministic, pure.
// Auto-grades generated text for SUBSTANCE: low-substance "slop" fails several
// tests, substantive text passes all five. Pairs with repl/anti-slop.ts
// (that flags AI-VOICE drift; this flags LOW-SUBSTANCE drift — a different axis).
//
// CALL POINT (not wired this round): a generation-review step — e.g. the
// Cofounder work-product reviewer, or repl/anti-slop.ts's caller — runs
// runSlopDiagnostic(text, prompt) on generated text and rejects/flags when
// result.isSlop, mirroring how clarity-gate / nl-assertions reject low-quality
// output before it reaches the operator.

export type SlopTest = {
  id: SlopTestId;
  label: string;
  failed: boolean;
  detail?: string;
};

export type SlopTestId =
  | "hedge"
  | "filler"
  | "no-specifics"
  | "restates-prompt"
  | "buzzword";

export type SlopResult = {
  tests: SlopTest[];
  slopScore: number; // 0..1, weighted average of the density signals
  isSlop: boolean;
};

// --- word/phrase lists (small + documented; heuristic, not exhaustive) ---

/** Weasel words that hedge a claim without adding information. */
const HEDGE_TERMS = [
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
const FILLER_PHRASES = [
  "it's important to note",
  "it is important to note",
  "at the end of the day",
  "when it comes to",
  "in today's world",
  "needless to say",
  "the fact of the matter is",
];

/** Empty corporate buzzwords. */
const BUZZWORDS = [
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

const HEDGE_FAIL_AT = 0.04; // hedge terms per word
const FILLER_FAIL_AT = 0.015; // filler phrases per word
const BUZZWORD_FAIL_AT = 0.03; // buzzwords per word
const RESTATE_FAIL_AT = 0.6; // prompt-token overlap fraction
const SLOP_SCORE_CUTOFF = 0.34; // isSlop when slopScore exceeds this
const FAILED_TEST_CUTOFF = 3; // ...or when at least this many tests fail
const DENSITY_NORM = 0.05; // density that maps to a full 1.0 signal

const WORD_RE = /[a-z0-9][a-z0-9'-]*/gi;
const NUMBER_RE = /\d/;
const PROPER_NOUN_RE = /(?:^|[^.!?]\s)([A-Z][a-zA-Z]+)/; // Capitalized, not sentence-start-only
const CODE_TOKEN_RE = /`[^`]+`|\b[\w/-]+\.[a-z]{1,5}\b|\b\w+\([^)]*\)|\b\w+_\w+\b/;

function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

function countPhrases(haystack: string, phrases: string[]): number {
  const lower = haystack.toLowerCase();
  let total = 0;
  for (const phrase of phrases) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at === -1) break;
      total += 1;
      from = at + phrase.length;
    }
  }
  return total;
}

/** Clamp a per-word density into a 0..1 signal against DENSITY_NORM. */
function densitySignal(hits: number, wordCount: number): number {
  if (wordCount === 0) return 0;
  return Math.min(1, hits / wordCount / DENSITY_NORM);
}

// --- the five pure checks ---

/** Weasel-word density per word, 0..1. Higher = more hedging. */
export function hedgeDensity(text: string): number {
  const wordCount = words(text).length;
  if (wordCount === 0) return 0;
  return Math.min(1, countPhrases(text, HEDGE_TERMS) / wordCount / DENSITY_NORM);
}

/** Filler/boilerplate-phrase density per word, 0..1. */
export function fillerDensity(text: string): number {
  const wordCount = words(text).length;
  if (wordCount === 0) return 0;
  return Math.min(1, countPhrases(text, FILLER_PHRASES) / wordCount / DENSITY_NORM);
}

/** Buzzword density per word, 0..1. */
export function buzzwordDensity(text: string): number {
  const wordCount = words(text).length;
  if (wordCount === 0) return 0;
  return Math.min(1, countPhrases(text, BUZZWORDS) / wordCount / DENSITY_NORM);
}

/**
 * True when the text carries NO concrete specifics — no numbers, no proper
 * nouns, no code/file-ish tokens. Concrete substance defeats this test.
 */
export function lacksSpecifics(text: string): boolean {
  if (!text.trim()) return true;
  const hasNumber = NUMBER_RE.test(text);
  const hasProperNoun = PROPER_NOUN_RE.test(text);
  const hasCodeToken = CODE_TOKEN_RE.test(text);
  return !(hasNumber || hasProperNoun || hasCodeToken);
}

/**
 * Fraction of the answer's tokens that merely echo the prompt — overlap of
 * the answer with the prompt WITHOUT adding new tokens. 0..1; higher = more
 * restating. Returns 0 when there's no prompt to compare against.
 */
export function restatesPrompt(text: string, prompt?: string): number {
  if (!prompt) return 0;
  const answerWords = words(text).map((w) => w.toLowerCase());
  if (answerWords.length === 0) return 0;
  const promptSet = new Set(words(prompt).map((w) => w.toLowerCase()));
  if (promptSet.size === 0) return 0;
  let echoed = 0;
  for (const w of answerWords) if (promptSet.has(w)) echoed += 1;
  return echoed / answerWords.length;
}

// --- aggregate ---

function buildTests(text: string, prompt: string | undefined): {
  tests: SlopTest[];
  densities: number[];
} {
  const hedge = hedgeDensity(text);
  const filler = fillerDensity(text);
  const buzzword = buzzwordDensity(text);
  const restate = restatesPrompt(text, prompt);
  const tests: SlopTest[] = [
    {
      id: "hedge",
      label: "hedge/weasel density",
      failed: hedge > HEDGE_FAIL_AT,
      detail: `${(hedge * 100).toFixed(0)}% signal`,
    },
    {
      id: "filler",
      label: "filler/boilerplate phrases",
      failed: filler > FILLER_FAIL_AT,
      detail: `${(filler * 100).toFixed(0)}% signal`,
    },
    {
      id: "no-specifics",
      label: "no concrete specifics",
      failed: lacksSpecifics(text),
      detail: lacksSpecifics(text) ? "no numbers/names/code tokens" : "has specifics",
    },
    {
      id: "restates-prompt",
      label: "restates the prompt",
      failed: restate > RESTATE_FAIL_AT,
      detail: prompt ? `${(restate * 100).toFixed(0)}% overlap` : "no prompt given",
    },
    {
      id: "buzzword",
      label: "buzzword density",
      failed: buzzword > BUZZWORD_FAIL_AT,
      detail: `${(buzzword * 100).toFixed(0)}% signal`,
    },
  ];
  // no-specifics contributes a fixed signal so it weights into the score
  const noSpecificsSignal = lacksSpecifics(text) ? 1 : 0;
  return { tests, densities: [hedge, filler, buzzword, restate, noSpecificsSignal] };
}

/**
 * Run the 5-test slop diagnostic. Pure. Empty text → max slop (nothing of
 * substance). slopScore = weighted average of the density signals; isSlop
 * when slopScore exceeds the cutoff OR at least FAILED_TEST_CUTOFF tests fail.
 */
export function runSlopDiagnostic(text: string, prompt?: string): SlopResult {
  if (!text.trim()) {
    const tests = buildTests("", prompt).tests.map((t) => ({ ...t, failed: true }));
    return { tests, slopScore: 1, isSlop: true };
  }
  const { tests, densities } = buildTests(text, prompt);
  const slopScore = densities.reduce((sum, d) => sum + d, 0) / densities.length;
  const failedCount = tests.filter((t) => t.failed).length;
  const isSlop = slopScore > SLOP_SCORE_CUTOFF || failedCount >= FAILED_TEST_CUTOFF;
  return { tests, slopScore, isSlop };
}

/** Readable one-line report: `slop N% — failed: <ids>` (or `— clean`). */
export function formatSlopReport(result: SlopResult): string {
  const pct = `${Math.round(result.slopScore * 100)}%`;
  const failed = result.tests.filter((t) => t.failed).map((t) => t.id);
  const tail = failed.length ? `failed: ${failed.join(", ")}` : "clean";
  return `slop ${pct} — ${tail}`;
}
