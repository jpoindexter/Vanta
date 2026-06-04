import type { LLMProvider } from "../providers/interface.js";
import type { WorkItem, VerifyResult } from "./types.js";

const JUDGE_SYS = `You are a strict code review judge. You receive a work item description and a list of changed files.
Determine whether the changes plausibly address the work item's intent.
Respond ONLY with valid JSON on one line: {"satisfied": boolean, "reason": string}
"satisfied" is true only when the changes clearly target the described goal. Be strict — tangential or unrelated changes should be rejected.`;

/**
 * Extract and validate the first JSON object from an LLM response.
 * Pure — exported for unit testing.
 */
export function parseJudgeResponse(text: string): { satisfied: boolean; reason: string } | null {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.satisfied !== "boolean") return null;
    return {
      satisfied: parsed.satisfied,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return null;
  }
}

/**
 * LLM-as-judge intent gate. Returns ok:true when the LLM confirms the changed
 * files plausibly address the work item. Fails OPEN on LLM errors so the
 * deterministic gates (tests / tsc) remain the hard floor.
 */
export async function checkIntentSatisfied(
  workItem: WorkItem,
  touchedFiles: string[],
  provider: LLMProvider,
): Promise<VerifyResult> {
  if (!touchedFiles.length) {
    return { ok: false, reason: "intent not satisfied: no files were changed" };
  }
  try {
    const cap = 30;
    const fileList = touchedFiles.slice(0, cap).join(", ") + (touchedFiles.length > cap ? ` … (+${touchedFiles.length - cap} more)` : "");
    const user = `Work item: ${workItem.description}\n\nChanged files: ${fileList}`;
    const res = await provider.complete(
      [{ role: "system", content: JUDGE_SYS }, { role: "user", content: user }],
      [],
    );
    const verdict = parseJudgeResponse(res.text);
    if (!verdict) {
      console.warn("  ⚠ intent judge: malformed response — failing open");
      return { ok: true };
    }
    if (!verdict.satisfied) {
      return { ok: false, reason: `intent not satisfied: ${verdict.reason || "changes don't address the work item"}` };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`  ⚠ intent judge: error (failing open) — ${err instanceof Error ? err.message : String(err)}`);
    return { ok: true };
  }
}
