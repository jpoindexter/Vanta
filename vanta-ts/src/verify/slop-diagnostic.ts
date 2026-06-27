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

import {
  HEDGE_TERMS, FILLER_PHRASES, BUZZWORDS, HEDGE_FAIL_AT, FILLER_FAIL_AT,
  BUZZWORD_FAIL_AT, RESTATE_FAIL_AT, SLOP_SCORE_CUTOFF, FAILED_TEST_CUTOFF,
  DENSITY_NORM, WORD_RE, NUMBER_RE, PROPER_NOUN_RE, CODE_TOKEN_RE,
} from "./slop-rubric.js";

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
