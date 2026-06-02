import type { Skill, SkillMeta } from "./types.js";

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
    // Unknown keys are ignored — SkillMeta is a closed shape.
  }
  return meta;
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
 * Serialize a {@link Skill} to the flat, Hermes-compatible SKILL.md format:
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
    "---",
  ].join("\n");
  return `${frontmatter}\n\n${body}`;
}
