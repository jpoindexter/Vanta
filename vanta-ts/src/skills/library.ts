import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skillsDir, ensureVantaStore, commitInHome, resolveVantaHome, slugifySkillName } from "../store/home.js";
import { readMetadataCache, writeMetadataCache } from "../cache/metadata.js";
import { parseSkill } from "./frontmatter.js";
import type { Skill } from "./types.js";

const SKILL_FILE = "SKILL.md";

/**
 * The bundled skill library shipped with Vanta — high-value skills, coupling-stripped.
 * Lives at
 * vanta-ts/skills-library/<slug>/SKILL.md, resolved from this module's path so it
 * works under tsx regardless of cwd (same approach as cli.ts findRepoRoot).
 */
export function libraryDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills-library");
}

/**
 * All bundled skill sources, in install order. `skills-library/` (curated + nd-*
 * skills) plus the repo-root focused technical packs — kept in their source folders and installed
 * from there rather than duplicated. Later sources don't override earlier ones;
 * each slug installs once (existing slugs are skipped).
 *
 * `executive-function-skills/` is deliberately not installed here. Vanta owns
 * that behavior in its core prompt; the standalone pack is an export for other
 * compatible agents and would duplicate the runtime contract if self-installed.
 */
export function librarySources(): string[] {
  const base = dirname(fileURLToPath(import.meta.url));
  const repoRoot = process.env.VANTA_ROOT?.trim() || join(base, "..", "..", "..");
  return [
    join(base, "..", "..", "skills-library"),
    join(repoRoot, "design-system-skills"),
    join(repoRoot, "ai-engineering-skills"),
    join(repoRoot, "security-skills"),
  ];
}

export type InstallResult = { installed: string[]; skipped: string[] };

export function bundledSkillCachePath(
  env: NodeJS.ProcessEnv = process.env,
  sources: readonly string[] = librarySources(),
): string {
  const key = createHash("sha256").update(sources.map((source) => resolve(source)).sort().join("\n")).digest("hex").slice(0, 20);
  return join(resolveVantaHome(env), "cache", "bundled-skills", `${key}.json`);
}

export async function listBundledSkills(
  opts: { env?: NodeJS.ProcessEnv; sources?: string[] } = {},
): Promise<Skill[]> {
  const env = opts.env ?? process.env;
  const sources = opts.sources ?? librarySources();
  const sourcePaths: string[] = [...sources];
  const candidates: Array<{ slug: string; path: string }> = [];
  for (const source of sources) {
    const entries = await readdir(source, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(source, entry.name, SKILL_FILE);
      sourcePaths.push(join(source, entry.name), path);
      if (existsSync(path)) candidates.push({ slug: entry.name, path });
    }
  }

  const cachePath = bundledSkillCachePath(env, sources);
  const cached = await readMetadataCache<Skill[]>(cachePath, 1);
  if (Array.isArray(cached) && cached.every((skill) =>
    typeof skill?.meta?.name === "string" && typeof skill.meta.description === "string" && typeof skill.body === "string"
  )) return cached;

  const bySlug = new Map<string, Skill>();
  for (const candidate of candidates) {
    if (bySlug.has(candidate.slug)) continue;
    const skill = await readFile(candidate.path, "utf8").then(parseSkill).catch(() => null);
    if (skill) bySlug.set(candidate.slug, skill);
  }
  const skills = [...bySlug.values()].sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  await writeMetadataCache(cachePath, 1, skills, sourcePaths).catch(() => {});
  return skills;
}

export async function readBundledSkill(name: string, env: NodeJS.ProcessEnv = process.env): Promise<Skill | null> {
  const slug = slugifySkillName(name);
  for (const source of librarySources()) {
    const skill = await readFile(join(source, slug, SKILL_FILE), "utf8").then(parseSkill).catch(() => null);
    if (skill) return skill;
  }
  const indexed = await listBundledSkills({ env });
  return indexed.find((skill) => skill.meta.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** Install one slug from a source into dest. Returns its disposition. */
async function installOne(
  source: string,
  name: string,
  dest: string,
  opts: { force?: boolean } = {},
): Promise<"installed" | "skipped" | null> {
  const src = join(source, name, SKILL_FILE);
  if (!existsSync(src)) return null;
  const target = join(dest, name, SKILL_FILE);
  if (existsSync(target) && !opts.force) return "skipped";
  await mkdir(join(dest, name), { recursive: true });
  await writeFile(target, await readFile(src, "utf8"), "utf8");
  return "installed";
}

/**
 * Copy bundled library skills into the user's `~/.vanta/skills`. Idempotent and
 * non-destructive: an existing skill of the same slug is SKIPPED (the user's
 * edits win) unless `force` is set. Installs from every {@link librarySources}
 * dir; `from` overrides to a single source dir (tests).
 */
export async function installSkillLibrary(
  opts: { env?: NodeJS.ProcessEnv; force?: boolean; from?: string } = {},
): Promise<InstallResult> {
  const sources = opts.from ? [opts.from] : librarySources();
  const dest = skillsDir(opts.env);
  await ensureVantaStore(opts.env);

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const source of sources) {
    let entries;
    try {
      entries = await readdir(source, { withFileTypes: true });
    } catch {
      continue; // a missing source dir is fine — try the next
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const r = await installOne(source, entry.name, dest, { force: !!opts.force });
      if (r === "installed") installed.push(entry.name);
      else if (r === "skipped") skipped.push(entry.name);
    }
  }

  // One batch commit for the whole install, not one per skill — a fresh install
  // is ~86 skills, and 86 sequential add+commit spawns is what made this take
  // ~50s under a loaded machine. Per-skill commit granularity only matters for
  // user edits and learned skills (skills/store.ts), not a bulk bundle copy.
  if (installed.length > 0) {
    await commitInHome("skills", `skill: install library (${installed.length} new)`, opts.env);
  }

  return { installed, skipped };
}
