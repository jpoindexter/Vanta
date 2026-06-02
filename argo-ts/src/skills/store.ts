import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  skillsDir,
  slugifySkillName,
  ensureArgoStore,
  commitInHome,
} from "../store/home.js";
import { parseSkill, serializeSkill } from "./frontmatter.js";
import type { Skill } from "./types.js";

/** Subdir reserved for retired skills; never returned by listSkills. */
const ARCHIVE_DIR = "_archive";
const SKILL_FILE = "SKILL.md";

/**
 * Tag stamped on skills the post-turn self-improvement review writes. Lightweight
 * provenance: the curator only auto-archives stale skills carrying this tag, so
 * hand-authored skills are never moved without the user's say-so.
 */
export const LEARNED_TAG = "argo-learned";

type StoreOpts = { env?: NodeJS.ProcessEnv; now?: string };

type WriteInput = {
  name: string;
  description: string;
  body: string;
  tags?: string[];
};

function skillPath(slug: string, env?: NodeJS.ProcessEnv): string {
  return join(skillsDir(env), slug, SKILL_FILE);
}

/** Read+parse a SKILL.md, returning null if it does not exist. */
async function tryReadSkill(path: string): Promise<Skill | null> {
  try {
    return parseSkill(await readFile(path, "utf8"));
  } catch {
    // missing file or unparseable — treat as absent
    return null;
  }
}

/**
 * Write (create or update) a skill to skillsDir/<slug>/SKILL.md and commit it.
 * Preserves the original `created` on overwrite; always bumps `updated`.
 */
export async function writeSkill(
  input: WriteInput,
  opts: StoreOpts = {},
): Promise<{ skill: Skill; path: string }> {
  const env = opts.env;
  const now = opts.now ?? new Date().toISOString();
  await ensureArgoStore(env);

  const slug = slugifySkillName(input.name);
  const path = skillPath(slug, env);

  // Preserve the first-write timestamp if the skill already exists.
  const existing = await tryReadSkill(path);
  const created = existing?.meta.created ?? now;

  const skill: Skill = {
    meta: {
      name: input.name,
      description: input.description,
      created,
      updated: now,
      tags: input.tags ?? [],
    },
    body: input.body,
  };

  await mkdir(join(skillsDir(env), slug), { recursive: true });
  await writeFile(path, serializeSkill(skill), "utf8");
  await commitInHome(join("skills", slug, SKILL_FILE), `skill: ${slug}`, env);

  return { skill, path };
}

/** Load a single skill by name, or null if it has not been written. */
export async function readSkill(
  name: string,
  env?: NodeJS.ProcessEnv,
): Promise<Skill | null> {
  return tryReadSkill(skillPath(slugifySkillName(name), env));
}

/**
 * List every stored skill sorted by name. Skips the _archive dir and any
 * subdir lacking a SKILL.md (e.g. a stray file or in-progress write).
 */
export async function listSkills(env?: NodeJS.ProcessEnv): Promise<Skill[]> {
  await ensureArgoStore(env);
  const dir = skillsDir(env);

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ARCHIVE_DIR) continue;
    const skill = await tryReadSkill(join(dir, entry.name, SKILL_FILE));
    if (skill) skills.push(skill);
  }

  return skills.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}
