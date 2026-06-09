// DECISION-GUARD: surface a conflict when a user message proposes something
// that contradicts a locked decision in DECISIONS.md.
// Pure classifier — callers wire into pre-send or topic-shift hooks.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type DecisionEntry = {
  title: string;
  choice: string;
  why: string;
};

/** Parse DECISIONS.md into structured entries. Pure (takes file content). */
export function parseDecisions(content: string): DecisionEntry[] {
  const entries: DecisionEntry[] = [];
  // Each decision starts with ## YYYY-MM-DD — <title>
  const blocks = content.split(/^## \d{4}-\d{2}-\d{2}/m).slice(1);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim());
    const titleLine = lines[0] ?? "";
    const title = titleLine.replace(/^[-–—\s]+/, "").trim();
    const choiceLine = lines.find((l) => /^choice:/i.test(l.trim())) ?? "";
    const whyLine = lines.find((l) => /^why:/i.test(l.trim())) ?? "";
    const choice = choiceLine.replace(/^choice:\s*/i, "").trim();
    const why = whyLine.replace(/^why:\s*/i, "").trim();
    if (title) entries.push({ title, choice, why });
  }
  return entries;
}

/**
 * Check if a user message might be re-litigating a locked decision.
 * Returns a conflict note or null. Pure.
 */
export function detectConflict(
  message: string,
  decisions: DecisionEntry[],
): string | null {
  const lower = message.toLowerCase();
  for (const d of decisions) {
    const keywords = d.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const choiceWords = d.choice.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const allKeywords = [...new Set([...keywords, ...choiceWords])];
    const matchCount = allKeywords.filter((kw) => lower.includes(kw)).length;
    // Only flag if multiple keywords match and message suggests changing/reconsidering
    const reconsiderSignal = /\b(change|switch|replace|instead|why not|reconsider|undo|revert|different|alternative)\b/.test(lower);
    if (matchCount >= 2 && reconsiderSignal) {
      const whyNote = d.why ? ` Reason: ${d.why}` : "";
      return `⚠ conflicts with locked decision: "${d.title}" (${d.choice}).${whyNote}`;
    }
  }
  return null;
}

/** Load and parse DECISIONS.md from the repo root. Returns [] if missing. */
export async function loadDecisions(repoRoot: string): Promise<DecisionEntry[]> {
  try {
    const content = await readFile(join(repoRoot, "DECISIONS.md"), "utf8");
    return parseDecisions(content);
  } catch {
    return [];
  }
}
