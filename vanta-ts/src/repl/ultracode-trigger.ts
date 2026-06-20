// ULTRACODE-TRIGGER — detect the bare keyword `ultracode` inside a user prompt
// and turn on the ultracode / dynamic-workflow disposition for that turn, matching
// how the `/ultracode` slash command already works (see repl/think-cmd.ts — the
// ULTRACODE preamble: a multi-agent, swarm-parallel, adversarially-verified coding
// push). Pure, best-effort, zero I/O, zero LLM — same heuristic shape as
// clarity-gate / mode-detect: detect + strip + build a disposition note, the
// intended consumer wires it in.
//
// Intended pre-turn consumer (NOT wired this round, mirroring clarity-gate's
// detector/host split): the message pre-processor that already prepends a
// mode hint to the SENT message — `repl/mode-detect.ts` (buildModeHint) via its
// hosts (interactive.ts `runUserTurn` / ui/use-agent.ts `sendToAgent`). That host
// should call `hasUltracodeTrigger(text)`; when true, `stripUltracodeTrigger(text)`
// becomes the instruction the agent acts on and `buildUltracodeDirective()` is
// prepended as the disposition note — exactly the preamble `/ultracode` injects.

// Whole-word, case-insensitive `ultracode` — NOT matched inside another word
// ("ultracoded", "ultracoder", "myultracode"). `\b` on each side enforces the
// word boundary; the `i` flag handles case.
const ULTRACODE_WORD = /\bultracode\b/i;

// Global variant for strip — removes every standalone occurrence in one pass.
const ULTRACODE_WORD_GLOBAL = /\bultracode\b/gi;

/**
 * True when the prompt contains the whole word `ultracode` (case-insensitive,
 * not as a substring of a larger word). Pure, synchronous, deterministic.
 * A prompt without the keyword → false (the caller leaves the turn unchanged).
 */
export function hasUltracodeTrigger(text: string): boolean {
  return ULTRACODE_WORD.test(text);
}

/**
 * Remove every standalone `ultracode` keyword from the text so it does not
 * pollute the instruction the agent acts on, then tidy the whitespace the
 * removal leaves behind (collapse the resulting double spaces, drop a dangling
 * leading/trailing space). Returns the text unchanged when the keyword is
 * absent. Pure, idempotent.
 */
export function stripUltracodeTrigger(text: string): string {
  if (!ULTRACODE_WORD.test(text)) return text; // no keyword → unchanged
  return text
    .replace(ULTRACODE_WORD_GLOBAL, "")
    .replace(/[ \t]{2,}/g, " ") // collapse runs of spaces/tabs the removal left
    .replace(/ +([.,;:!?])/g, "$1") // tidy a space orphaned before punctuation
    .replace(/^[ \t]+|[ \t]+$/gm, "") // trim each line's leading/trailing space
    .trim();
}

// The disposition note — byte-for-byte the preamble `/ultracode` injects
// (repl/think-cmd.ts ULTRACODE), so the keyword path turns on the SAME
// multi-agent dynamic-workflow disposition as the slash command.
const ULTRACODE_DIRECTIVE =
  "Approach this as a multi-agent coding push: " +
  "(1) decompose the work into independent units; " +
  "(2) delegate/swarm parallel subagents on DISJOINT files; " +
  "(3) adversarially verify each result (tests + a skeptic pass) before accepting it; " +
  "(4) synthesize the verified pieces, run the full suite + typecheck, and report honestly. " +
  "Use the delegate, swarm, and loop tools. Keep every slice green.";

/**
 * The ultracode disposition note to prepend to the (stripped) instruction when
 * the trigger fires — mirrors what `/ultracode` injects. Pure.
 */
export function buildUltracodeDirective(): string {
  return ULTRACODE_DIRECTIVE;
}
