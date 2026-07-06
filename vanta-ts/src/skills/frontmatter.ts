import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Skill, SkillMeta, SkillTrigger } from "./types.js";

// Anchored at the start: opening fence, the frontmatter block, closing fence.
// Lazy body capture so the FIRST "\n---" closes it. No second fence => no match
// => the whole input is treated as body (handles the no-frontmatter case).
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/** Parse "[a, b, c]" or bare "a, b, c" into a clean tag list; empties dropped. */
function parseTags(value: string): string[] {
  // Strip a single surrounding bracket pair if present, then split on commas.
  const inner = value.replace(/^\[(.*)\]$/s, "$1");
  return inner
    .split(",")
    .map((t) => t.trim())
    // Drops the [""] artifact from empty/"[]" input and trailing commas.
    .filter((t) => t.length > 0);
}

/** Parse a single-line JSON array of triggers (SKILL-TRIGGERS). Lenient: bad JSON
 *  or non-array → []; entries without a string `event` are dropped. Must be one line
 *  (the frontmatter parser is line-based) — compact JSON satisfies that. */
function parseTriggers(value: string): SkillTrigger[] {
  try {
    const arr: unknown = JSON.parse(value);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (t): t is SkillTrigger => !!t && typeof t === "object" && typeof (t as { event?: unknown }).event === "string",
    );
  } catch {
    return [];
  }
}

/** Read flat "key: value" frontmatter lines into the fixed SkillMeta shape. */
function parseMeta(block: string): SkillMeta {
  const meta: SkillMeta = {
    name: "",
    description: "",
    created: "",
    updated: "",
    tags: [],
  };
  for (const line of block.split("\n")) {
    // Split on the FIRST colon only — ISO timestamps contain colons.
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key === "name") meta.name = value;
    else if (key === "description") meta.description = value;
    else if (key === "created") meta.created = value;
    else if (key === "updated") meta.updated = value;
    else if (key === "tags") meta.tags = parseTags(value);
    else if (key === "volatile") meta.volatile = value === "true";
    else if (key === "triggers") meta.triggers = parseTriggers(value);
    // Unknown keys are ignored — SkillMeta is a closed shape.
  }
  return meta;
}

/**
 * Parse the RAW frontmatter block into a flat key→string record (ALL keys,
 * unlike {@link parseSkill}'s closed SkillMeta). For fields SkillMeta drops —
 * `schedule` (HARNESS-BLUEPRINT-SKILLS), `activateOn`, etc. First-colon split
 * (ISO timestamps contain colons); no frontmatter → {}. Pure.
 */
export function readSkillFrontmatter(md: string): Record<string, string> {
  const match = md.match(FRONTMATTER_RE);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    out[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return out;
}

/**
 * Parse a SKILL.md string into a {@link Skill}. The leading "---\n…\n---\n"
 * frontmatter block (if any) becomes {@link SkillMeta}; the remainder is the
 * trimmed body. With no frontmatter, meta fields are empty and the whole input
 * is the body.
 */
export function parseSkill(md: string): Skill {
  const match = md.match(FRONTMATTER_RE);
  if (!match) {
    return {
      meta: { name: "", description: "", created: "", updated: "", tags: [] },
      body: md.trim(),
    };
  }
  return {
    meta: parseMeta(match[1] ?? ""),
    body: md.slice(match[0].length).trim(),
  };
}

/**
 * Replace `$ARGUMENTS` in `body` with `args`. Escaped `\$ARGUMENTS` is left
 * as a literal `$ARGUMENTS` (the backslash is consumed). Single-pass to avoid
 * mangling `args` strings that themselves contain `$ARGUMENTS`.
 */
export function expandSkillArgs(body: string, args: string): string {
  return body.replace(/\\?\$ARGUMENTS/g, (m) => (m.startsWith("\\") ? "$ARGUMENTS" : args));
}

/** Regex matching a line that is solely an @-import reference. */
const AT_IMPORT_RE = /^@([\w./\-]+)$/gm;

/**
 * Expand `@path/to/file` lines in `body` by reading each file relative to
 * `root` and replacing the line with its contents. Unreadable files are silently
 * skipped (best-effort). Async: uses parallel file reads for speed.
 */
export async function expandAtImports(body: string, root: string): Promise<string> {
  const lines = body.split("\n");
  const expanded = await Promise.all(
    lines.map(async (line) => {
      AT_IMPORT_RE.lastIndex = 0;
      const m = AT_IMPORT_RE.exec(line);
      if (!m) return line;
      try {
        return await readFile(join(root, m[1]!), "utf8");
      } catch {
        return line; // unreadable — leave as-is
      }
    }),
  );
  return expanded.join("\n");
}

/**
 * Serialize a {@link Skill} to the flat, portable SKILL.md format:
 * a frontmatter block (tags as "[a, b, c]") then a blank line then the body.
 * Round-trips with {@link parseSkill} for well-formed input.
 */
export function serializeSkill(skill: Skill): string {
  const { meta, body } = skill;
  const frontmatter = [
    "---",
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `created: ${meta.created}`,
    `updated: ${meta.updated}`,
    `tags: [${meta.tags.join(", ")}]`,
    ...(meta.volatile ? ["volatile: true"] : []),
    ...(meta.triggers?.length ? [`triggers: ${JSON.stringify(meta.triggers)}`] : []),
    "---",
  ].join("\n");
  return `${frontmatter}\n\n${body}`;
}
