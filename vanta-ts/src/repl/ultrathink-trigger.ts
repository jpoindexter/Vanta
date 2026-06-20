// ULTRATHINK-TRIGGER — detect the bare keyword `ultrathink` inside a user prompt
// and map THAT turn to the MAX thinking/effort budget, matching how the
// `/ultrathink` slash command already works (see repl/think-cmd.ts ULTRATHINK —
// "engage maximum reasoning depth"). Pure, best-effort, zero I/O, zero LLM —
// same heuristic shape as ultracode-trigger: detect + strip + resolve the
// effort level; the intended consumer wires it in.
//
// Intended pre-turn consumer (NOT wired this round, mirroring ultracode-trigger's
// detector/host split): the message pre-processor that already reads the SENT
// message before a turn — `repl/mode-detect.ts` (buildModeHint) via its hosts
// (interactive.ts `runUserTurn` / ui/use-agent.ts `sendToAgent`). That host
// should call `hasUltrathinkTrigger(text)`; when true, `stripUltrathinkTrigger(text)`
// becomes the instruction the agent acts on and the turn's effort is bumped to
// `ultrathinkEffortLevel()` ("max"), which the provider layer reads from
// `CompletionConfig.effortLevel` (see providers/effort.ts buildOpenAIEffortParams /
// buildAnthropicEffortParams — "max" → reasoning_effort:"max" / 32000-token
// thinking budget) — exactly the max disposition `/ultrathink` engages.

import { type EffortLevel } from "../types.js";

// Whole-word, case-insensitive `ultrathink` — NOT matched inside another word
// ("ultrathinker", "myultrathink", "ultrathinking"). `\b` on each side enforces
// the word boundary; the `i` flag handles case.
const ULTRATHINK_WORD = /\bultrathink\b/i;

// Global variant for strip — removes every standalone occurrence in one pass.
const ULTRATHINK_WORD_GLOBAL = /\bultrathink\b/gi;

// The max effort level — the ceiling of the `low|medium|high|max` vocabulary
// (types.ts EFFORT_LEVELS). `/ultrathink` engages maximum reasoning depth; the
// keyword path resolves to the SAME max effort the level system already maps
// (providers/effort.ts: 32000-token thinking budget / reasoning_effort:"max").
const ULTRATHINK_EFFORT: EffortLevel = "max";

/**
 * True when the prompt contains the whole word `ultrathink` (case-insensitive,
 * not as a substring of a larger word). Pure, synchronous, deterministic.
 * A prompt without the keyword → false (the caller leaves the turn unchanged).
 */
export function hasUltrathinkTrigger(text: string): boolean {
  return ULTRATHINK_WORD.test(text);
}

/**
 * Remove every standalone `ultrathink` keyword from the text so it does not
 * pollute the instruction the agent acts on, then tidy the whitespace the
 * removal leaves behind (collapse the resulting double spaces, drop a dangling
 * leading/trailing space). Returns the text unchanged when the keyword is
 * absent. Pure, idempotent.
 */
export function stripUltrathinkTrigger(text: string): string {
  if (!ULTRATHINK_WORD.test(text)) return text; // no keyword → unchanged
  return text
    .replace(ULTRATHINK_WORD_GLOBAL, "")
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces/tabs the removal left
    .replace(/ +([.,;:!?])/g, "$1") // tidy a space orphaned before punctuation
    .replace(/^[ \t]+|[ \t]+$/gm, "") // trim each line's leading/trailing space
    .trim();
}

/**
 * The effort level the `ultrathink` keyword maps the turn to — the MAX budget,
 * matching what the `/ultrathink` command does. Pure, deterministic. The host
 * sets this as the turn's `CompletionConfig.effortLevel`.
 */
export function ultrathinkEffortLevel(): EffortLevel {
  return ULTRATHINK_EFFORT;
}
