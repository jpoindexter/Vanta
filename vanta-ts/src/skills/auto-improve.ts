/**
 * VANTA-SKILL-IMPROVEMENT — auto skill improvement.
 *
 * After a skill is invoked in a session, a periodic background LLM review can
 * propose an improved skill body (clarify steps, fix what went wrong, add a
 * learned caveat) based on how the skill actually performed that turn. This
 * mirrors `review/background-review.ts` (env gating + best-effort, never throws)
 * but is specialized to ONE skill body rather than capturing a new skill.
 *
 * Everything here is PURE/injectable: the should-improve decision, the prompt
 * build, and the parse of the proposed improvement are unit-tested in isolation;
 * the LLM call is injected via `deps.complete` (NO real provider).
 *
 * Crucially, this is a PROPOSAL — it NEVER writes a skill. The proposal lands
 * where the existing self-improvement surfaces gate a write: the post-turn
 * reviewer (`review/background-review.ts reviewTurn`, the same fork that already
 * holds `write_skill`) would surface the proposed body for operator/curator
 * approval, and only then persist it via `write_skill` under the same skill name
 * (the curator — `skills/curator.ts` — remains non-destructive, so the operator
 * gates the overwrite; mirror the clarity-gate). Disabled or not-invoked → nothing.
 */

/** The skill under review: just its name and current markdown body. */
export type SkillUnderReview = { name: string; body: string };

/** A one-line summary of how the skill actually performed this turn. */
export type TurnSummary = string;

/**
 * The outcome of a review. `improved:false` carries the ORIGINAL body unchanged
 * (the only safe default — a no-change proposal never alters the skill). A real
 * proposal sets `improved:true`, the new `body`, and a short `note` describing
 * what changed. This is a value, never a write — the operator/curator gates any
 * persistence.
 */
export type SkillImprovement = {
  improved: boolean;
  body: string;
  note?: string;
};

/** Injected LLM call — the same shape as a single-shot completion. */
export type ImproveDeps = {
  complete: (prompt: string) => Promise<string>;
};

/** Sentinel the model is instructed to return when the skill needs no change. */
const NO_CHANGE = "no change";

/**
 * Should a periodic improvement review run for this skill this turn? PURE.
 * True only when the skill WAS invoked this turn AND the feature is enabled via
 * `VANTA_SKILL_IMPROVE=1` (default OFF). Anything else → false (nothing happens).
 * Mirrors `shouldReview`'s env gate, but defaults off (opt-in) — a skill-body
 * rewrite is higher-stakes than capturing a fresh skill.
 */
export function shouldImproveSkill(
  skillName: string,
  invokedThisTurn: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!skillName.trim()) return false;
  if (!invokedThisTurn) return false;
  return isEnabled(env);
}

/** `VANTA_SKILL_IMPROVE` is opt-in: only `1`/`true`/`on`/`yes` enables it. */
function isEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_SKILL_IMPROVE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Build the review prompt asking the model to improve the skill body based on
 * how it performed this turn, or reply with the no-change sentinel. PURE.
 * References both the current body and the turn summary so the model can clarify
 * steps, fix what went wrong, or add a learned caveat — without inventing a new
 * skill or fabricating context it wasn't shown.
 */
export function buildImprovementPrompt(skill: SkillUnderReview, turnSummary: TurnSummary): string {
  const summary = turnSummary.trim() || "(no turn summary provided)";
  return [
    `You are Vanta's skill-improvement reviewer. The skill "${skill.name}" was just used in a work session.`,
    `Your ONE job: decide whether its body should be improved based on how it ACTUALLY performed, and if so return the full improved body.`,
    "",
    "Improve the body when the turn revealed a way to make it clearer or more reliable next time: clarify an ambiguous step, fix a step that went wrong, or add a learned caveat the turn surfaced.",
    `Do NOT rewrite for taste, do NOT invent steps the turn didn't justify, and do NOT change the skill's purpose. If nothing genuinely needs to change, reply with exactly "${NO_CHANGE}".`,
    "",
    "Return ONLY the improved markdown body (no frontmatter, no preamble, no code fences), or the no-change sentinel.",
    "",
    `=== HOW IT PERFORMED THIS TURN ===\n${summary}`,
    "",
    `=== CURRENT SKILL BODY ("${skill.name}") ===\n${skill.body}`,
  ].join("\n");
}

/**
 * Parse the model's response into a {@link SkillImprovement}. PURE.
 * An empty response, the no-change sentinel, or a body identical to the original
 * (after trimming) → `{improved:false, body: originalBody}` (the original is
 * preserved verbatim, never the trimmed copy). A genuinely different body →
 * `{improved:true, body, note}` where the proposed body is trimmed of any
 * stray surrounding fences/whitespace.
 */
export function parseImprovement(llmResponse: string, originalBody: string): SkillImprovement {
  const cleaned = stripFences(llmResponse).trim();
  if (!cleaned || cleaned.toLowerCase() === NO_CHANGE) {
    return { improved: false, body: originalBody };
  }
  if (cleaned === originalBody.trim()) {
    return { improved: false, body: originalBody };
  }
  return { improved: true, body: cleaned, note: "proposed an improved skill body" };
}

/** Strip a single surrounding ```...``` fence the model may have wrapped the body in. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/**
 * Run one skill-improvement review. Best-effort and NON-DESTRUCTIVE: builds the
 * prompt, calls the injected `complete`, and parses the result into a PROPOSAL.
 * NEVER writes a skill — the returned {@link SkillImprovement} is a value the
 * operator/curator gates before any `write_skill`. A `complete` throw (or any
 * failure) yields a no-change proposal — it NEVER throws, mirroring `reviewTurn`'s
 * swallow-everything contract so a review can't affect the main turn.
 */
export async function proposeSkillImprovement(
  skill: SkillUnderReview,
  turnSummary: TurnSummary,
  deps: ImproveDeps,
): Promise<SkillImprovement> {
  try {
    const prompt = buildImprovementPrompt(skill, turnSummary);
    const response = await deps.complete(prompt);
    return parseImprovement(response, skill.body);
  } catch {
    // Best-effort: a review failure must never surface to the main turn.
    return { improved: false, body: skill.body };
  }
}
