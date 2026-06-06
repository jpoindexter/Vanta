import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { skillsDir, ensureArgoStore, commitInHome } from "../store/home.js";

const SKILL_FILE = "SKILL.md";

/**
 * The bundled skill library shipped with Argo — high-value skills ported from
 * the Hermes/OpenClaw references (coupling stripped). Lives at
 * argo-ts/skills-library/<slug>/SKILL.md, resolved from this module's path so it
 * works under tsx regardless of cwd (same approach as cli.ts findRepoRoot).
 */
export function libraryDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills-library");
}

/**
 * All bundled skill sources, in install order. `skills-library/` (Hermes-ported
 * + nd-* skills) plus the repo-root `design-system-skills/` (the 17 design
 * skills) — kept in their showcase folder (with its HTML viewer) and installed
 * from there rather than duplicated. Later sources don't override earlier ones;
 * each slug installs once (existing slugs are skipped).
 */
export function librarySources(): string[] {
  const base = dirname(fileURLToPath(import.meta.url));
  return [
    join(base, "..", "..", "skills-library"),
    join(base, "..", "..", "..", "design-system-skills"),
    join(base, "..", "..", "..", "ai-engineering-skills"),
  ];
}

export type InstallResult = { installed: string[]; skipped: string[] };

/** Install one slug from a source into dest. Returns its disposition. */
async function installOne(
  source: string,
  name: string,
  dest: string,
  force: boolean,
  env?: NodeJS.ProcessEnv,
): Promise<"installed" | "skipped" | null> {
  const src = join(source, name, SKILL_FILE);
  if (!existsSync(src)) return null;
  const target = join(dest, name, SKILL_FILE);
  if (existsSync(target) && !force) return "skipped";
  await mkdir(join(dest, name), { recursive: true });
  await writeFile(target, await readFile(src, "utf8"), "utf8");
  await commitInHome(join("skills", name, SKILL_FILE), `skill: install ${name}`, env);
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
  await ensureArgoStore(opts.env);

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
      const r = await installOne(source, entry.name, dest, !!opts.force, opts.env);
      if (r === "installed") installed.push(entry.name);
      else if (r === "skipped") skipped.push(entry.name);
    }
  }

  return { installed, skipped };
}
