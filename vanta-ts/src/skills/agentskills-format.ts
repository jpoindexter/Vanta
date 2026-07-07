import { parseSkill, readSkillFrontmatter } from "./frontmatter.js";
import type { Skill } from "./types.js";

// VANTA-SKILLS-HUB — interop with the agentskills.io / Anthropic Agent Skills
// open format: a SKILL.md with YAML frontmatter (`name`, `description`, optional
// `allowed-tools`, `license`) + a markdown body. Vanta's own SKILL.md is already
// a superset, and parseSkill IGNORES unknown keys, so a third-party skill loads
// with no code change — this module just maps the interop fields both ways so
// export stays spec-compatible. Pure.

/** Split a YAML scalar-or-list frontmatter value ("a, b" or "[a, b]") into items. */
function splitList(value: string): string[] {
  return value.replace(/^\[(.*)\]$/s, "$1").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Parse an agentskills.io SKILL.md into a Vanta {@link Skill}. name/description/
 * body come from the standard parse; `allowed-tools` (scalar or list) and
 * `license` are preserved so export round-trips. `created`/`updated` default to
 * `now` (the format carries no timestamps). Unknown fields are dropped, so ANY
 * conformant third-party skill loads without a code change. Pure. */
export function fromAgentSkills(md: string, now: string): Skill {
  const skill = parseSkill(md);
  const raw = readSkillFrontmatter(md);
  const allowed = raw["allowed-tools"] ?? raw["allowedTools"];
  return {
    meta: {
      ...skill.meta,
      created: skill.meta.created || now,
      updated: skill.meta.updated || now,
      ...(allowed ? { allowedTools: splitList(allowed) } : {}),
      ...(raw.license ? { license: raw.license } : {}),
    },
    body: skill.body,
  };
}

/**
 * Serialize a Vanta {@link Skill} to the agentskills.io format: only the
 * portable fields (`name`, `description`, `allowed-tools`, `license`) — Vanta's
 * created/updated/tags/triggers are runtime-internal and omitted so the output
 * is a clean, conformant third-party skill. Pure. */
export function toAgentSkills(skill: Skill): string {
  const { meta, body } = skill;
  const lines = ["---", `name: ${meta.name}`, `description: ${meta.description}`];
  if (meta.allowedTools?.length) lines.push(`allowed-tools: [${meta.allowedTools.join(", ")}]`);
  if (meta.license) lines.push(`license: ${meta.license}`);
  lines.push("---");
  return `${lines.join("\n")}\n\n${body}`;
}
