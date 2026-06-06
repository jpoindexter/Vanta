import type { WorkItem } from "./types.js";
import type { LLMProvider } from "../providers/interface.js";

// FAC-HOLDOUT: Author-separation validation.
// The implementing agent must NOT author its own acceptance check —
// today the same cycle writes code + test, enabling weak-test reward-hacking.
// This module provides holdout criteria generation (by a DIFFERENT agent than
// the executor) and a validation step against those criteria.

export type HoldoutCriteria = {
  workItemDescription: string;
  acceptanceCriteria: string[];
  antiPatterns: string[];
};

const HOLDOUT_SYS =
  "You are a strict acceptance-test author. Given a work item, write 3-5 concrete, " +
  "verifiable acceptance criteria the implementing agent must satisfy. " +
  "Also list 2-3 anti-patterns (ways the implementation could game its own test). " +
  "Return JSON: {acceptanceCriteria:[\"...\"], antiPatterns:[\"...\"]}. Be specific and terse.";

/**
 * Generate holdout criteria for a work item using a SEPARATE provider call.
 * In a real deployment, this would use a different model than the executor.
 * Returns null if criteria generation fails (best-effort).
 */
export async function generateHoldout(
  item: WorkItem,
  provider: LLMProvider,
): Promise<HoldoutCriteria | null> {
  try {
    const { text } = await provider.complete(
      [
        { role: "system", content: HOLDOUT_SYS },
        { role: "user", content: `Work item: ${item.description}\nHint: ${item.hint ?? "(none)"}` },
      ],
      [],
      { maxTokens: 512 },
    );
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as { acceptanceCriteria?: unknown; antiPatterns?: unknown };
    if (!Array.isArray(p.acceptanceCriteria) || !Array.isArray(p.antiPatterns)) return null;
    return {
      workItemDescription: item.description,
      acceptanceCriteria: p.acceptanceCriteria as string[],
      antiPatterns: p.antiPatterns as string[],
    };
  } catch {
    return null;
  }
}

const VALIDATE_SYS =
  "You are a strict code reviewer who has never seen this code before. " +
  "Given acceptance criteria and the actual implementation result, determine if each criterion passes. " +
  "Return JSON: {passes: boolean, failing: [\"criteria that failed\"], note: \"brief explanation\"}.";

/**
 * Validate a factory result against holdout criteria.
 * Uses the provider as a third-party reviewer (separate from the executor).
 */
export async function validateAgainstHoldout(
  criteria: HoldoutCriteria,
  implementationSummary: string,
  provider: LLMProvider,
): Promise<{ passes: boolean; failing: string[]; note: string }> {
  try {
    const criteriaText = criteria.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const antiText = criteria.antiPatterns.map((a) => `- ${a}`).join("\n");
    const { text } = await provider.complete(
      [
        { role: "system", content: VALIDATE_SYS },
        {
          role: "user",
          content: `Acceptance criteria:\n${criteriaText}\n\nAnti-patterns to watch for:\n${antiText}\n\nImplementation summary:\n${implementationSummary.slice(0, 1000)}`,
        },
      ],
      [],
      { maxTokens: 512 },
    );
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return { passes: false, failing: ["parse error"], note: "validation response malformed" };
    const p = parsed as { passes?: unknown; failing?: unknown; note?: unknown };
    return {
      passes: Boolean(p.passes),
      failing: Array.isArray(p.failing) ? (p.failing as string[]) : [],
      note: typeof p.note === "string" ? p.note : "",
    };
  } catch {
    return { passes: false, failing: ["validation error"], note: "holdout validation failed" };
  }
}
