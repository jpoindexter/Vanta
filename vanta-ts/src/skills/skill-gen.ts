import { z } from "zod";
import { slugifySkillName } from "../store/home.js";

// SKILL-GEN (VANTA-RUN-SKILL-GEN). Pure skill-definition builder: turn a
// natural-language description into a prompt for a model, then parse the model's
// reply into a valid {name, description, body} the existing writeSkill path can
// persist. No storage here — the bundled skill-generator/SKILL.md drives the
// agent to call write_skill with this output. Errors are values, never thrown.

/** A validated skill definition ready for the existing writeSkill path. */
export type SkillDef = {
  /** kebab-case slug-safe name; cannot escape skillsDir (slugify-validated). */
  name: string;
  /** One-line summary used by recall to decide relevance. */
  description: string;
  /** The markdown how-to body. */
  body: string;
};

/** Errors-as-values: either a built {@link SkillDef} or a reason it failed. */
export type SkillGenResult =
  | { ok: true; def: SkillDef }
  | { ok: false; error: string };

const MIN_BODY = 20; // a one-liner is not a skill — guard against empty replies.

/**
 * The model's expected JSON reply. We accept name/description/body strings and
 * re-validate them ourselves; the model is an untrusted boundary so zod parses
 * it, and the name is re-slugified so a crafted name can't escape the store.
 */
const ModelOutput = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
});

/**
 * Build the generator prompt from a free-text description. Pure. The model is
 * instructed to return ONLY a JSON object so {@link parseSkillModelOutput} can
 * read it deterministically.
 */
export function buildSkillGenPrompt(description: string): string {
  return [
    "You generate a reusable agent skill from a description.",
    "Return ONLY a JSON object (no prose, no code fence) with exactly these keys:",
    '- "name": a short kebab-case slug (lowercase, hyphens, no spaces).',
    '- "description": one sentence stating WHEN to use the skill.',
    '- "body": a Markdown how-to (a "# Title", then concise steps/rules).',
    "",
    "Skill to generate, described by the user:",
    description.trim(),
  ].join("\n");
}

/** Strip a single ```json … ``` (or bare ```) fence if the model added one. */
function stripFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/^```(?:json)?\n([\s\S]*?)\n```$/);
  return (fenced ? fenced[1]! : t).trim();
}

/** Validate + normalize a candidate into a {@link SkillDef}, or a reason. Pure. */
function toSkillDef(raw: unknown): SkillGenResult {
  const parsed = ModelOutput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "skill output must have name, description, body strings" };
  }
  const name = slugifySkillName(parsed.data.name);
  if (name === "unnamed-skill") {
    return { ok: false, error: `name "${parsed.data.name}" is not a valid kebab slug` };
  }
  const body = parsed.data.body.trim();
  if (body.length < MIN_BODY) {
    return { ok: false, error: `body too short (${body.length} chars, need >= ${MIN_BODY})` };
  }
  return {
    ok: true,
    def: { name, description: parsed.data.description.trim(), body },
  };
}

/**
 * Parse a model's raw reply (the JSON object from {@link buildSkillGenPrompt})
 * into a validated {@link SkillDef}. Malformed JSON or a failing shape returns a
 * reason, never throws. Pure.
 */
export function parseSkillModelOutput(modelOutput: string): SkillGenResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(modelOutput));
  } catch {
    return { ok: false, error: "model output is not valid JSON" };
  }
  return toSkillDef(raw);
}

/**
 * One-call builder: with `modelOutput`, parse it into a {@link SkillDef}; without
 * it, return the prompt to send the model (so a caller can run the model itself).
 * Pure — does no I/O. The returned `def` is ready for the existing `write_skill`
 * tool / `writeSkill` store path (no storage is duplicated here).
 */
export function buildSkillFromDescription(
  description: string,
  modelOutput?: string,
): SkillGenResult | { ok: true; prompt: string } {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "description is empty" };
  }
  if (modelOutput === undefined) {
    return { ok: true, prompt: buildSkillGenPrompt(trimmed) };
  }
  return parseSkillModelOutput(modelOutput);
}
