// CC-PROMPT-KEYWORDS — bare continuation/negative phrase detection.
// "keep going" resumes the prior task; "stop"/"never mind" are recognized too.
// Matches ONLY a near-bare phrase — embedded in a longer instruction it must NOT fire.

/** Sent in place of a literal "keep going" so the agent resumes the prior task. */
export const CONTINUE_NUDGE = "Continue with the previous task — pick up exactly where you left off.";

const CONTINUE_PHRASES = new Set([
  "keep going",
  "continue",
  "go on",
  "proceed",
  "keep at it",
  "carry on",
]);

const STOP_PHRASES = new Set([
  "stop",
  "never mind",
  "nevermind",
  "cancel that",
  "forget it",
]);

/** Trim, lowercase, strip one trailing `.`/`!`/`?`. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?]$/, "").trim();
}

/**
 * Classify a bare continuation/negative phrase. Whole normalized text must equal
 * a known phrase — "keep going" matches, "keep going on the auth refactor" does not.
 */
export function classifyPromptKeyword(text: string): "continue" | "stop" | null {
  const phrase = normalize(text);
  if (CONTINUE_PHRASES.has(phrase)) return "continue";
  if (STOP_PHRASES.has(phrase)) return "stop";
  return null;
}
