import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  skillsDir,
  slugifySkillName,
  ensureVantaStore,
  commitInHome,
} from "../store/home.js";
import { parseSkill, serializeSkill } from "./frontmatter.js";
import { scanForInjection } from "./gating.js";
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
  /** agentskills.io interop (VANTA-SKILLS-HUB) — persisted so an imported skill round-trips. */
  allowedTools?: string[];
  license?: string;
};

function skillPath(slug: string, env?: NodeJS.ProcessEnv): string {
  return join(skillsDir(env), slug, SKILL_FILE);
}

// listSkills runs many times per process; a scan warning should surface once
// per path, not on every call (HARNESS-SKILL-GATING noise control).
const warnedPaths = new Set<string>();
function warnOnce(message: string): void {
  const key = message.slice(message.lastIndexOf(":") + 1).trim();
  if (warnedPaths.has(key)) return;
  warnedPaths.add(key);
  console.error(message);
}

/** Read+parse a SKILL.md, returning null if it does not exist. */
async function tryReadSkill(path: string, env: NodeJS.ProcessEnv = process.env): Promise<Skill | null> {
  try {
    const raw = await readFile(path, "utf8");
    // HARNESS-SKILL-GATING: injection-scan the body before it enters the
    // offerable set. These are the OPERATOR'S OWN skills — a security-topic
    // skill legitimately quotes "ignore previous instructions", so the default
    // is FLAG (warn once), not skip: a false skip breaks a real skill. Opt in to
    // hard-skipping tainted skills with VANTA_SKILL_STRICT=1.
    const scan = scanForInjection(raw);
    if (!scan.clean) {
      if (env.VANTA_SKILL_STRICT === "1") {
        warnOnce(`  ⚠ skill skipped (VANTA_SKILL_STRICT, injection scan: ${scan.hits.join(", ")}): ${path}`);
        return null;
      }
      warnOnce(`  ⚠ skill flagged (injection scan: ${scan.hits.join(", ")}) — loaded; set VANTA_SKILL_STRICT=1 to skip: ${path}`);
    }
    return parseSkill(raw);
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
  await ensureVantaStore(env);

  const slug = slugifySkillName(input.name);
  const path = skillPath(slug, env);

  // Preserve the first-write timestamp if the skill already exists.
  const existing = await tryReadSkill(path, env);
  const created = existing?.meta.created ?? now;

  const skill: Skill = {
    meta: {
      name: input.name,
      description: input.description,
      created,
      updated: now,
      tags: input.tags ?? [],
      ...(input.allowedTools?.length ? { allowedTools: input.allowedTools } : {}),
      ...(input.license ? { license: input.license } : {}),
    },
    body: input.body,
  };

  await mkdir(join(skillsDir(env), slug), { recursive: true });
  await writeFile(path, serializeSkill(skill), "utf8");
  await commitInHome(join("skills", slug, SKILL_FILE), `skill: ${slug}`, env);

  return { skill, path };
}

/**
 * Reversibly retire a skill by moving its dir into `_archive` (mirrors the
 * curator; NEVER deletes — Rule Zero). The self-learning loop uses this to revert
 * a proposed skill that fails its eval-gate. Returns false (no-op) if the skill
 * dir is absent or the move fails — best-effort, never throws.
 */
export async function archiveSkill(name: string, env?: NodeJS.ProcessEnv): Promise<boolean> {
  const slug = slugifySkillName(name);
  const root = skillsDir(env);
  try {
    await mkdir(join(root, ARCHIVE_DIR), { recursive: true });
    await rename(join(root, slug), join(root, ARCHIVE_DIR, slug));
    await commitInHome(join("skills", ARCHIVE_DIR, slug, SKILL_FILE), `archive skill: ${slug}`, env);
    return true;
  } catch {
    return false;
  }
}

/** Load a single skill by name, or null if it has not been written. */
export async function readSkill(
  name: string,
  env?: NodeJS.ProcessEnv,
): Promise<Skill | null> {
  return tryReadSkill(skillPath(slugifySkillName(name), env), env);
}

/**
 * List every stored skill sorted by name. Skips the _archive dir and any
 * subdir lacking a SKILL.md (e.g. a stray file or in-progress write).
 */
export async function listSkills(env?: NodeJS.ProcessEnv): Promise<Skill[]> {
  await ensureVantaStore(env);
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
    const skill = await tryReadSkill(join(dir, entry.name, SKILL_FILE), env);
    if (skill) skills.push(skill);
  }

  return skills.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
}
