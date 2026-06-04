import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { resolveArgoHome } from "../store/home.js";

export type BundleConfig = {
  name: string;
  description: string;
  skills: string[];
  instruction?: string;
};

export function parseBundle(content: string): BundleConfig | null {
  try {
    const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    const instruction = /^instruction:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1]?.trim();
    if (!name || !description) return null;
    // Parse YAML list items: lines starting with "  - " or "- "
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
    return { name, description, skills, instruction };
  } catch {
    return null;
  }
}

function bundlesDir(env?: NodeJS.ProcessEnv): string {
  return join(resolveArgoHome(env), "skill-bundles");
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

/** Write a bundle YAML to ~/.argo/skill-bundles/<name>.yaml. */
export async function writeBundle(cfg: BundleConfig, env?: NodeJS.ProcessEnv): Promise<void> {
  const dir = bundlesDir(env);
  await mkdir(dir, { recursive: true });
  const skillsList = cfg.skills.map((s) => `  - ${s}`).join("\n");
  const yaml = `name: "${cfg.name}"\ndescription: "${cfg.description}"\nskills:\n${skillsList}\n${cfg.instruction ? `instruction: "${cfg.instruction}"\n` : ""}`;
  await writeFile(join(dir, `${basename(cfg.name)}.yaml`), yaml, "utf8");
}
