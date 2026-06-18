import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { estTokens } from "winnow";
import { skillsDir, slugifySkillName } from "../store/home.js";
import type { LLMProvider } from "../providers/interface.js";

// SKILL-DISTILL-EXAMPLES (text-side S2L, arXiv:2606.16769). A long procedural SKILL.md can
// be carried by a few worked input→output demonstrations instead of the full doc. This
// distills a skill body into compact examples and stores them next to the skill; recall
// can then serve the distilled form (opt-in), cutting the tokens a skill spends in context.
// No training — just an injected LLM (the LoRA route is S2L-LORA-SKILLS).

const DISTILLED_FILE = "DISTILLED.md";
const MIN_DISTILLED = 20; // ignore a too-short / empty model reply

const DISTILL_SYS = `You compress an agent skill into worked examples. Read the SKILL document and produce at most N concise input→output demonstrations that capture HOW the skill is applied — when to use it, the steps taken, and what the result looks like. The examples must let an agent reproduce the skill's behavior WITHOUT the full document. Output Markdown only: a short "## Examples" section with numbered cases (Input: … / Approach: … / Output: …). No preamble.`;

/** Path to a skill's distilled form. */
export function distilledPath(name: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(skillsDir(env), slugifySkillName(name), DISTILLED_FILE);
}

/** The distill prompt for a skill body. Pure. */
export function buildDistillPrompt(name: string, body: string, maxExamples: number): string {
  return `Skill: ${name}\nN = ${maxExamples}\n\n--- SKILL DOCUMENT ---\n${body}`;
}

/** Accept the model's distilled markdown, or null when it's empty/too short. Pure. */
export function distilledFromText(text: string): string | null {
  const t = text.trim();
  return t.length >= MIN_DISTILLED ? t : null;
}

/** Token savings of the distilled form vs the full body. Pure. */
export function distillSavings(fullBody: string, distilled: string): {
  before: number; after: number; saved: number; ratio: number;
} {
  const before = estTokens(fullBody);
  const after = estTokens(distilled);
  const saved = Math.max(0, before - after);
  return { before, after, saved, ratio: before ? saved / before : 0 };
}

export async function readDistilled(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const p = distilledPath(name, env);
  if (!existsSync(p)) return null;
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function writeDistilled(name: string, content: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const dir = join(skillsDir(env), slugifySkillName(name));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, DISTILLED_FILE), content, "utf8");
}

/** recall serves the distilled form only when VANTA_SKILL_DISTILLED is enabled. */
export function distilledEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.VANTA_SKILL_DISTILLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * Distil a skill body into worked examples via the provider, store them, and return them.
 * Best-effort: a provider failure or empty reply returns null (the full skill stays usable).
 */
export async function distillSkill(opts: {
  name: string;
  body: string;
  provider: LLMProvider;
  maxExamples?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  try {
    const { text } = await opts.provider.complete(
      [
        { role: "system", content: DISTILL_SYS },
        { role: "user", content: buildDistillPrompt(opts.name, opts.body, opts.maxExamples ?? 3) },
      ],
      [],
    );
    const distilled = distilledFromText(text);
    if (distilled) await writeDistilled(opts.name, distilled, opts.env);
    return distilled;
  } catch {
    return null;
  }
}
