// RESEARCH-LOOP: Pure prompt builders for a structured autonomous research loop.
// No side effects, no imports. Every export is a plain function.

/** Describes a research task before the loop begins. */
export type ResearchBrief = {
  question: string;
  uncertainties: string[];
  sources?: string[];
};

const MAX_ITEM_CHARS = 200;

function cap(s: string): string {
  return s.length > MAX_ITEM_CHARS ? s.slice(0, MAX_ITEM_CHARS - 1) + "…" : s;
}

/**
 * Pure. Produces a structured research prompt from a brief.
 * Instructs: search → verify each claim → note remaining unknowns → cite.
 */
export function buildResearchPrompt(brief: ResearchBrief): string {
  const uncertaintyLines = brief.uncertainties
    .map((u) => `- ${cap(u)}`)
    .join("\n");
  const sourceLines =
    brief.sources && brief.sources.length
      ? `\nKnown starting sources:\n${brief.sources.map((s) => `- ${cap(s)}`).join("\n")}`
      : "";
  return [
    `Research question: ${brief.question}`,
    "",
    "What we do not know yet:",
    uncertaintyLines,
    sourceLines,
    "",
    "Instructions:",
    "1. Search for evidence that addresses the question and each uncertainty.",
    "2. For every claim found, verify it against at least one additional source.",
    "3. Note explicitly what remains uncertain after the search.",
    "4. Produce a summary that includes: what we know, what we are uncertain about, and citations for every fact.",
  ]
    .join("\n")
    .trim();
}

/**
 * Pure. Wraps raw findings into a synthesis prompt asking for a final brief.
 */
export function buildResearchSummaryPrompt(
  question: string,
  findings: string,
): string {
  return [
    `Given these findings for "${question}":`,
    "",
    findings.trim(),
    "",
    "Produce a final brief with three sections:",
    "1. What we know (with citations).",
    "2. What we are uncertain about and why.",
    "3. The single recommended next step.",
  ].join("\n");
}

/**
 * Pure. Rough turn estimate for a research loop with `sourceCount` sources.
 * Each source takes 1 turn minimum; verifying each takes up to 2 more.
 */
export function estimateResearchCost(sourceCount: number): {
  minTurns: number;
  maxTurns: number;
} {
  return { minTurns: sourceCount, maxTurns: sourceCount * 3 };
}
