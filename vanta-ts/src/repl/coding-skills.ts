import { dirname } from "node:path";
import { readSkill } from "../skills/store.js";
import { buildVerificationCloseoutPrompt } from "../verify/visual-closeout.js";
import type { SlashHandler, SlashResult } from "./types.js";

// Coding-skills: slash command handlers for /review, /simplify, /verify, /run.
// Each loads the corresponding skill from the skill store and passes it to the
// agent as a resend instruction. Skills install on first session start via
// installSkillLibrary (skills-library/cc-review, cc-simplify, cc-verify, cc-run).

async function runSkill(skillName: string, task: string, arg?: string): Promise<SlashResult> {
  const skill = await readSkill(skillName);
  if (!skill) return { output: `  skill "${skillName}" not found — run \`vanta skills install\`` };
  const instruction = arg ? `${task} (${arg})` : task;
  return { resend: `${skill.body}\n\n${instruction}` };
}

export const review: SlashHandler = (arg) =>
  runSkill("cc-review", "Review the current diff for bugs and cleanups.", arg || "medium");

export const simplify: SlashHandler = () =>
  runSkill("cc-simplify", "Review the changed code and apply simplification/efficiency/altitude cleanups.");

export const verify: SlashHandler = async (arg, ctx) => {
  const scope = arg ? ` Scope: ${arg}.` : "";
  const closeout = await buildVerificationCloseoutPrompt(dirname(ctx.dataDir));
  return runSkill("cc-verify", `Verify that the latest change actually works by running the app and observing behavior.${scope}\n\n${closeout}`);
};

export const run: SlashHandler = (arg) =>
  runSkill("cc-run", arg ? `Launch the app and run: ${arg}` : "Launch and drive this project's app on the golden path.");
