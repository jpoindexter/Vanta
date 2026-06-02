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

export type InstallResult = { installed: string[]; skipped: string[] };

/**
 * Copy bundled library skills into the user's `~/.argo/skills`. Idempotent and
 * non-destructive: an existing skill of the same slug is SKIPPED (the user's
 * edits win) unless `force` is set. Returns which slugs were installed vs
 * skipped. `from` overrides the source dir (tests).
 */
export async function installSkillLibrary(
  opts: { env?: NodeJS.ProcessEnv; force?: boolean; from?: string } = {},
): Promise<InstallResult> {
  const source = opts.from ?? libraryDir();
  const dest = skillsDir(opts.env);
  await ensureArgoStore(opts.env);

  const installed: string[] = [];
  const skipped: string[] = [];

  let entries;
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch {
    return { installed, skipped }; // no bundled library — nothing to do
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = join(source, entry.name, SKILL_FILE);
    if (!existsSync(src)) continue;

    const targetDir = join(dest, entry.name);
    const target = join(targetDir, SKILL_FILE);
    if (existsSync(target) && !opts.force) {
      skipped.push(entry.name);
      continue;
    }

    await mkdir(targetDir, { recursive: true });
    await writeFile(target, await readFile(src, "utf8"), "utf8");
    await commitInHome(join("skills", entry.name, SKILL_FILE), `skill: install ${entry.name}`, opts.env);
    installed.push(entry.name);
  }

  return { installed, skipped };
}
