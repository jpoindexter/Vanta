// REFLECT-CORRECT: extract a correction rule from user messages and persist it to
// the brain "reflections" region. Post-turn, best-effort — never throws.

import { classifyMemory } from "../memory/relevance.js";
import { writeRegion } from "../brain/brain.js";

/**
 * Pure. Returns a normalized rule string if the message looks like a correction,
 * or null if not. Uses classifyMemory from memory/relevance for consistent signal.
 */
export function extractCorrectionRule(userMessage: string): string | null {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;

  const result = classifyMemory(trimmed);
  if (result.class !== "correction" && result.class !== "durable-constraint") {
    return null;
  }

  const normalized = trimmed.startsWith("Rule:") ? trimmed : `Rule: ${trimmed}`;
  return normalized;
}

/**
 * Side-effectful. Calls extractCorrectionRule; if non-null, appends the rule to
 * the brain "reflections" region. Best-effort — never throws.
 */
export async function reflectAfterTurn(
  userMessage: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  try {
    const rule = extractCorrectionRule(userMessage);
    if (!rule) return;
    await writeRegion("reflections", rule, { append: true, env });
  } catch {
    // best-effort — never surface to the caller
  }
}
