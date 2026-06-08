// SELF-EVAL: lightweight post-turn self-check that flags common anti-patterns in
// agent responses before they reach the user. Pure — no I/O, no side effects.

const UNVERIFIED_COMMITMENT_RE = /\b(i'?ll|i will)\b.*\b(implement|add|create|fix|update|build|write|run|do|make)\b/i;
const COMPLETION_CLAIM_RE = /\b(done|complete|completed|finished)\b/i;
const HEDGED_FACTUAL_RE = /\b(i think|probably|maybe)\b/i;
const MARKDOWN_STRUCTURE_RE = /^#{1,6} |^\s*[-*] |\n#{1,6} |\n\s*[-*] |```/m;

/**
 * Pure. Checks `text` for anti-patterns and returns an array of flag strings.
 * Empty array = response passed all checks.
 */
export function selfEvalResponse(text: string): string[] {
  const flags: string[] = [];

  // Unverified commitment: said will/I'll + an action verb, no tool result marker
  if (
    UNVERIFIED_COMMITMENT_RE.test(text) &&
    !text.includes("✓") &&
    !text.includes("Result:") &&
    !text.includes("Output:") &&
    !text.includes("tool_result")
  ) {
    flags.push("unverified commitment (said will, no tool proof)");
  }

  // Completion claim without any structural indicator of verified output
  if (
    COMPLETION_CLAIM_RE.test(text) &&
    !text.includes("✓") &&
    !text.includes("Result:") &&
    !text.includes("Output:") &&
    !text.includes("tool_result") &&
    !text.includes("DONE:")
  ) {
    flags.push("completion claim without verified output");
  }

  // Long unstructured response
  if (text.length > 2000 && !MARKDOWN_STRUCTURE_RE.test(text)) {
    flags.push("long unstructured response");
  }

  // Hedged factual claim
  if (HEDGED_FACTUAL_RE.test(text)) {
    flags.push("hedged factual claim — verify or label as uncertain");
  }

  return flags;
}

/**
 * Pure. Formats a flag list into a dim note string, or null if no flags.
 * Format: `  ⚑ self-check: {flag1} · {flag2}`
 */
export function formatSelfEval(flags: string[]): string | null {
  if (!flags.length) return null;
  return `  ⚑ self-check: ${flags.join(" · ")}`;
}
