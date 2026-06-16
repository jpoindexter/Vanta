import { listSkills, readSkill } from "../skills/store.js";
import { installSkillLibrary } from "../skills/library.js";
import { runInstruction } from "./commands.js";

async function runSkillsList(): Promise<void> {
  const skills = await listSkills();
  if (skills.length === 0) return void console.log("(no skills yet — `vanta skills install` to add the bundled library)");
  for (const s of skills) console.log(`${s.meta.name} — ${s.meta.description}`);
}

async function runSkillsBundle(rest: string[]): Promise<void> {
  const { listBundles, readBundle } = await import("../skills/bundle.js");
  const name = rest[1];
  if (!name) {
    const bundles = await listBundles();
    if (!bundles.length) return void console.log("(no bundles yet — create ~/.vanta/skill-bundles/<name>.yaml)");
    for (const b of bundles) console.log(`${b.name} — ${b.description} [${b.skills.join(", ")}]`);
    return;
  }
  const cfg = await readBundle(name);
  if (!cfg) { console.log(`No bundle named "${name}".`); process.exit(1); }
  console.log(`Bundle: ${cfg.name}\n  Skills: ${cfg.skills.join(", ")}\n${cfg.instruction ? `  Instruction: ${cfg.instruction}` : ""}`);
}

export async function runSkillsCommand(rest: string[]): Promise<void> {
  if (rest[0] === "lint") {
    const { lintSkills, formatLint } = await import("../skills/lint.js");
    const issues = await lintSkills();
    console.log(formatLint(issues));
    if (issues.some((i) => i.level === "error")) process.exit(1);
    return;
  }
  if (rest[0] === "bundle") return runSkillsBundle(rest);
  if (rest[0] !== "install") return runSkillsList();
  const { installed, skipped } = await installSkillLibrary({ force: rest.includes("--force") });
  console.log(`Installed ${installed.length} skill(s)${installed.length ? `: ${installed.join(", ")}` : ""}.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} already present (use --force to overwrite): ${skipped.join(", ")}.`);
  }
}

export async function runSkillCommand(repoRoot: string, rest: string[]): Promise<void> {
  const { usageExit } = await import("./commands.js");
  const [name, ...instr] = rest;
  if (!name) return usageExit();
  const skill = await readSkill(name);
  if (!skill) { console.log(`No skill named "${name}".`); process.exit(1); }
  if (instr.length === 0) return void console.log(`# ${skill.meta.name}\n\n${skill.body}`);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: skill.body });
}
