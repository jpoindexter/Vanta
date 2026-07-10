import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { readSkill } from "./store.js";
import type { Skill } from "./types.js";

export type BundleConfig = {
  name: string;
  description: string;
  skills: string[];
  instruction?: string;
};
export type ResolvedBundle = {
  config: BundleConfig;
  skills: Skill[];
  missing: string[];
  body: string;
};

// Parse YAML list items under `skills:` — lines starting with "  - ". Pure.
function parseSkillsList(content: string): string[] {
  const skills: string[] = [];
  let inSkillsList = false;
  for (const line of content.split("\n")) {
    if (/^skills:/.test(line)) { inSkillsList = true; continue; }
    if (inSkillsList && /^\s+-\s+/.test(line)) {
      skills.push(line.replace(/^\s+-\s+/, "").replace(/["']/g, "").trim());
    } else if (inSkillsList && line.trim() && !/^\s/.test(line)) {
      inSkillsList = false;
    }
  }
  return skills;
}

export function parseBundle(content: string): BundleConfig | null {
  try {
    const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    const instruction = /^instruction:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    if (!name || !description) return null;
    return { name, description, skills: parseSkillsList(content), instruction };
  } catch {
    return null;
  }
}

function bundlesDir(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "skill-bundles");
}

export async function listBundles(env?: NodeJS.ProcessEnv): Promise<BundleConfig[]> {
  const dir = bundlesDir(env);
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const bundles: BundleConfig[] = [];
  for (const entry of entries.filter((e) => e.endsWith(".yaml"))) {
    const content = await readFile(join(dir, entry), "utf8").catch(() => null);
    if (!content) continue;
    const cfg = parseBundle(content);
    if (cfg) bundles.push(cfg);
  }
  return bundles;
}

export async function readBundle(name: string, env?: NodeJS.ProcessEnv): Promise<BundleConfig | null> {
  const file = join(bundlesDir(env), `${name}.yaml`);
  const content = await readFile(file, "utf8").catch(() => null);
  return content ? parseBundle(content) : null;
}

export function buildBundleSkillBody(cfg: BundleConfig, skills: readonly Skill[], missing: readonly string[] = []): string {
  const sections = [
    `# Bundle: ${cfg.name}`,
    cfg.description,
    cfg.instruction ? `\n## Bundle Instruction\n${cfg.instruction}` : "",
    missing.length ? `\n## Missing Skills\n${missing.map((s) => `- ${s}`).join("\n")}` : "",
    ...skills.map((skill) => `\n## Skill: ${skill.meta.name}\n${skill.body}`),
  ];
  return sections.filter(Boolean).join("\n\n");
}

export async function resolveBundle(name: string, env?: NodeJS.ProcessEnv): Promise<ResolvedBundle | null> {
  const config = await readBundle(name, env);
  if (!config) return null;
  const loaded = await Promise.all(config.skills.map((skillName) => readSkill(skillName, env)));
  const skills = loaded.filter((skill): skill is Skill => Boolean(skill));
  const missing = config.skills.filter((_skillName, index) => !loaded[index]);
  return { config, skills, missing, body: buildBundleSkillBody(config, skills, missing) };
}

/** Write a bundle YAML to ~/.vanta/skill-bundles/<name>.yaml. */
export async function writeBundle(cfg: BundleConfig, env?: NodeJS.ProcessEnv): Promise<void> {
  const dir = bundlesDir(env);
  await mkdir(dir, { recursive: true });
  const skillsList = cfg.skills.map((s) => `  - ${s}`).join("\n");
  const yaml = `name: "${cfg.name}"\ndescription: "${cfg.description}"\nskills:\n${skillsList}\n${cfg.instruction ? `instruction: "${cfg.instruction}"\n` : ""}`;
  await writeFile(join(dir, `${basename(cfg.name)}.yaml`), yaml, "utf8");
}
