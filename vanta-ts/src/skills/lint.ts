import { readdir } from "node:fs/promises";
import { resolveMemoryStore } from "../store/memory-store.js";
import { slugifySkillName } from "../store/slug.js";
// NEEDS-SPECIAL (enumeration only): lint must distinguish a real skill
// DIRECTORY from a stray file (e.g. umbrellas.json) via `isDirectory()`, which
// the file-granular MemoryStore port's `list` does not expose — flagging
// non-dir entries as "missing SKILL.md" would be a behavior change. So the
// directory enumeration stays on fs; `skillsDir` is the PURE path resolver.
// The per-skill SKILL.md READ is migrated to the port below.
import { skillsDir } from "../store/home.js";
import { parseSkill } from "./frontmatter.js";

// `vanta skills lint` — structural validation of SKILL.md files so rot (name↔dir
// drift, missing fields, empty bodies, unparseable frontmatter) is caught early
// instead of by a downstream curator pass. Pure read; reports, never mutates.

export type SkillLintIssue = { skill: string; level: "error" | "warn"; message: string };

const ARCHIVE_DIR = ".archive";

type ParsedSkill = ReturnType<typeof parseSkill>;

/** Validate one parsed skill's metadata + body. Pure; returns issues for this slug. */
function lintOneMeta(slug: string, skill: ParsedSkill): SkillLintIssue[] {
  const out: SkillLintIssue[] = [];
  const err = (message: string) => out.push({ skill: slug, level: "error", message });
  const warn = (message: string) => out.push({ skill: slug, level: "warn", message });
  const m = skill.meta;
  if (!m.name?.trim()) err("missing name");
  else if (slugifySkillName(m.name) !== slug) warn(`name "${m.name}" → "${slugifySkillName(m.name)}" ≠ directory "${slug}"`);
  if (!m.description?.trim()) err("missing description");
  if (!m.created || Number.isNaN(Date.parse(m.created))) warn("missing/invalid created date");
  if (!m.updated || Number.isNaN(Date.parse(m.updated))) warn("missing/invalid updated date");
  if (!skill.body?.trim()) warn("empty body");
  return out;
}

export async function lintSkills(env: NodeJS.ProcessEnv = process.env): Promise<SkillLintIssue[]> {
  const dir = skillsDir(env);
  let slugs: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    slugs = entries.filter((e) => e.isDirectory() && e.name !== ARCHIVE_DIR && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }

  const store = resolveMemoryStore(env);
  const issues: SkillLintIssue[] = [];
  const err = (skill: string, message: string) => issues.push({ skill, level: "error", message });

  for (const slug of slugs) {
    const md = await store.read(`skills/${slug}/SKILL.md`);
    if (md === null) {
      err(slug, "missing SKILL.md");
      continue;
    }
    let skill;
    try {
      skill = parseSkill(md);
    } catch (e) {
      err(slug, `unparseable frontmatter: ${(e as Error).message}`);
      continue;
    }
    issues.push(...lintOneMeta(slug, skill));
  }
  return issues;
}

/** Human-readable lint report. */
export function formatLint(issues: SkillLintIssue[]): string {
  if (issues.length === 0) return "✓ all skills valid";
  const lines = issues.map((i) => `  ${i.level === "error" ? "✗" : "⚠"} ${i.skill}: ${i.message}`);
  const errs = issues.filter((i) => i.level === "error").length;
  return `${lines.join("\n")}\n${errs} error(s), ${issues.length - errs} warning(s)`;
}
