import { basename } from "node:path";
import { resolveMemoryStore } from "../store/memory-store.js";

/** Home-relative directory holding bundle YAMLs. */
const BUNDLES_DIR = "skill-bundles";

/** Home-relative path to a named bundle's YAML. */
function bundleRelPath(name: string): string {
  return `${BUNDLES_DIR}/${name}.yaml`;
}

export type BundleConfig = {
  name: string;
  description: string;
  skills: string[];
  instruction?: string;
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

export async function listBundles(env?: NodeJS.ProcessEnv): Promise<BundleConfig[]> {
  const store = resolveMemoryStore(env);
  const entries = await store.list(BUNDLES_DIR);
  const bundles: BundleConfig[] = [];
  for (const entry of entries.filter((e) => e.endsWith(".yaml"))) {
    const content = await store.read(`${BUNDLES_DIR}/${entry}`);
    if (!content) continue;
    const cfg = parseBundle(content);
    if (cfg) bundles.push(cfg);
  }
  return bundles;
}

export async function readBundle(name: string, env?: NodeJS.ProcessEnv): Promise<BundleConfig | null> {
  const content = await resolveMemoryStore(env).read(bundleRelPath(name));
  return content ? parseBundle(content) : null;
}

/** Write a bundle YAML to ~/.vanta/skill-bundles/<name>.yaml. */
export async function writeBundle(cfg: BundleConfig, env?: NodeJS.ProcessEnv): Promise<void> {
  const skillsList = cfg.skills.map((s) => `  - ${s}`).join("\n");
  const yaml = `name: "${cfg.name}"\ndescription: "${cfg.description}"\nskills:\n${skillsList}\n${cfg.instruction ? `instruction: "${cfg.instruction}"\n` : ""}`;
  await resolveMemoryStore(env).write(bundleRelPath(basename(cfg.name)), yaml);
}
