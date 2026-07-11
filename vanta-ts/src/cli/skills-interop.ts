import { readFile } from "node:fs/promises";
import { fromAgentSkills, toAgentSkills } from "../skills/agentskills-format.js";
import { writeSkill, readSkill } from "../skills/store.js";
import { serializeSkill } from "../skills/frontmatter.js";

// VANTA-SKILLS-HUB CLI — import a third-party agentskills.io skill (from a file
// or a hub URL) and export a Vanta skill in the interop format. The parse/format
// is pure (agentskills-format.ts); this is the thin IO shell.

/** `vanta skills import <file>` — load an agentskills.io SKILL.md into the store. */
async function importSkill(path: string | undefined): Promise<void> {
  if (!path) { console.error("usage: vanta skills import <SKILL.md>"); process.exit(1); }
  const md = await readFile(path, "utf8").catch(() => null);
  if (md === null) { console.error(`vanta skills import: cannot read ${path}`); process.exit(1); }
  const skill = fromAgentSkills(md, new Date().toISOString());
  if (!skill.meta.name) { console.error(`vanta skills import: ${path} has no \`name\` — not a valid skill`); process.exit(1); }
  const { path: written } = await writeSkill({ name: skill.meta.name, description: skill.meta.description, body: skill.body, tags: skill.meta.tags, allowedTools: skill.meta.allowedTools, license: skill.meta.license });
  console.log(`Imported "${skill.meta.name}"${skill.meta.allowedTools?.length ? ` (allowed-tools: ${skill.meta.allowedTools.join(", ")})` : ""} → ${written}`);
}

/** `vanta skills export <name> [--format agentskills|vanta]` — print the skill. */
async function exportSkill(name: string | undefined, agentFormat: boolean): Promise<void> {
  if (!name) { console.error("usage: vanta skills export <name> [--format agentskills]"); process.exit(1); }
  const skill = await readSkill(name);
  if (!skill) { console.error(`vanta skills export: no skill named "${name}"`); process.exit(1); }
  console.log(agentFormat ? toAgentSkills(skill) : serializeSkill(skill));
}

/** Legacy alias: preview a direct URL through the quarantined registry flow. */
async function hubImport(url: string | undefined): Promise<void> {
  if (!url) { console.error("usage: vanta skills hub <url-to-SKILL.md>"); process.exit(1); }
  const { runSkillsRegistryCommand } = await import("./skills-registry-cmd.js");
  process.exitCode = await runSkillsRegistryCommand(["install", `url:${url}`]);
}

/** Dispatch the interop subcommands; returns false when `rest[0]` isn't one. */
export async function runSkillsInterop(rest: string[]): Promise<boolean> {
  if (rest[0] === "import") { await importSkill(rest[1]); return true; }
  if (rest[0] === "export") { await exportSkill(rest[1], rest.includes("--format") && rest.includes("agentskills")); return true; }
  if (rest[0] === "hub") { await hubImport(rest[1]); return true; }
  return false;
}
