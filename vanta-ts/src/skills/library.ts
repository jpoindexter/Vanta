import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMemoryStore, type MemoryStore } from "../store/memory-store.js";

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
 * skills) plus the repo-root `design-system-skills/` (the 17 design
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

/**
 * Install one slug from a bundled `source` (an absolute repo dir, read from fs)
 * into the home `store` (a home-relative `skills/<name>/SKILL.md` write). Returns
 * its disposition.
 */
async function installOne(
  source: string,
  name: string,
  store: MemoryStore,
  opts: { force?: boolean } = {},
): Promise<"installed" | "skipped" | null> {
  const src = join(source, name, SKILL_FILE);
  if (!existsSync(src)) return null;
  const rel = `skills/${name}/${SKILL_FILE}`;
  if (!opts.force && (await store.read(rel)) !== null) return "skipped";
  await store.write(rel, await readFile(src, "utf8"));
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
  const store = resolveMemoryStore(opts.env);
  await store.ensure();

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
      const r = await installOne(source, entry.name, store, { force: !!opts.force });
      if (r === "installed") installed.push(entry.name);
      else if (r === "skipped") skipped.push(entry.name);
    }
  }

  // One batch commit for the whole install, not one per skill — a fresh install
  // is ~86 skills, and 86 sequential add+commit spawns is what made this take
  // ~50s under a loaded machine. Per-skill commit granularity only matters for
  // user edits and learned skills (skills/store.ts), not a bulk bundle copy.
  if (installed.length > 0) {
    await store.commit("skills", `skill: install library (${installed.length} new)`);
  }

  return { installed, skipped };
}
