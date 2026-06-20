import { listSkills, readSkill } from "../skills/store.js";
import { installSkillLibrary } from "../skills/library.js";
import { runInstruction } from "./commands.js";

async function runSkillsDistill(rest: string[]): Promise<void> {
  const { distillAll, formatDistillReport } = await import("../skills/distill-all.js");
  const { distillSkill, readDistilled, writeDistilled } = await import("../skills/distill.js");
  const { resolveProvider } = await import("../providers/index.js");

  const arg = rest[1];
  const all = arg === "--all" || arg === undefined;
  if (!all && arg.startsWith("--")) {
    console.log("Usage: vanta skills distill [--all | <skill name>]");
    process.exit(1);
  }

  const skills = await listSkills();
  const targets = (all ? skills : skills.filter((s) => s.meta.name === arg)).map((s) => ({
    name: s.meta.name,
    body: s.body,
  }));
  if (targets.length === 0) {
    console.log(all ? "(no skills installed — `vanta skills install` first)" : `No skill named "${arg}".`);
    process.exit(all ? 0 : 1);
  }

  const provider = resolveProvider(process.env);
  const outcomes = await distillAll({
    list: async () => targets,
    distill: async (t) => distillSkill({ name: t.name, body: t.body, provider }),
    readExisting: async (name) => readDistilled(name),
    writeOut: async (name, content) => writeDistilled(name, content),
  });
  console.log(formatDistillReport(outcomes));
}

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
  if (rest[0] === "distill") return runSkillsDistill(rest);
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
  // `vanta skill distill [--all|<name>]` mirrors the plural form (don't treat
  // "distill" as a skill to print/run).
  if (name === "distill") return runSkillsDistill(rest);
  const skill = await readSkill(name);
  if (!skill) { console.log(`No skill named "${name}".`); process.exit(1); }
  if (instr.length === 0) return void console.log(`# ${skill.meta.name}\n\n${skill.body}`);
  await runInstruction(repoRoot, instr.join(" "), { skillBody: skill.body });
}
