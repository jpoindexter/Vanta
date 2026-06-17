import { join } from "node:path";
import { slugifySkillName } from "../store/slug.js";
import { resolveMemoryStore } from "../store/memory-store.js";
// `skillsDir` is a PURE path resolver (no fs) — used only to build the absolute
// `path` that writeSkill returns. All persistence goes through resolveMemoryStore.
import { skillsDir } from "../store/home.js";
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
export const LEARNED_TAG = "vanta-learned";

type StoreOpts = { env?: NodeJS.ProcessEnv; now?: string };

type WriteInput = {
  name: string;
  description: string;
  body: string;
  tags?: string[];
};

/** Home-relative path to a skill's SKILL.md (e.g. "skills/<slug>/SKILL.md"). */
function skillRelPath(slug: string): string {
  return `skills/${slug}/${SKILL_FILE}`;
}

/** Read+parse a skill at a home-relative path, returning null if absent/unparseable. */
async function tryReadSkill(
  relPath: string,
  env?: NodeJS.ProcessEnv,
): Promise<Skill | null> {
  const store = resolveMemoryStore(env);
  const raw = await store.read(relPath);
  if (raw === null) return null;
  try {
    return parseSkill(raw);
  } catch {
    // unparseable — treat as absent
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
  const store = resolveMemoryStore(env);
  await store.ensure();

  const slug = slugifySkillName(input.name);
  const relPath = skillRelPath(slug);

  // Preserve the first-write timestamp if the skill already exists.
  const existing = await tryReadSkill(relPath, env);
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

  await store.write(relPath, serializeSkill(skill));
  await store.commit(relPath, `skill: ${slug}`);

  return { skill, path: join(skillsDir(env), slug, SKILL_FILE) };
}

/** Load a single skill by name, or null if it has not been written. */
export async function readSkill(
  name: string,
  env?: NodeJS.ProcessEnv,
): Promise<Skill | null> {
  return tryReadSkill(skillRelPath(slugifySkillName(name)), env);
}

/**
 * List every stored skill sorted by name. Skips the _archive dir and any
 * subdir lacking a SKILL.md (e.g. a stray file or in-progress write).
 */
export async function listSkills(env?: NodeJS.ProcessEnv): Promise<Skill[]> {
  const store = resolveMemoryStore(env);
  await store.ensure();

  const entries = await store.list("skills");

  const skills: Skill[] = [];
  for (const name of entries) {
    if (name === ARCHIVE_DIR) continue;
    const skill = await tryReadSkill(skillRelPath(name), env);
    if (skill) skills.push(skill);
  }

  return skills.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}
