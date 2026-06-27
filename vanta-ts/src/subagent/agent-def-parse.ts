/**
 * VANTA-AGENTS-DIR — parse a custom-agent markdown file into a CustomAgentDef
 * (PURE). The frontmatter/slug/tool-list parsing seam of agent-defs.ts; the dir
 * discovery + built-in resolution compose this. Re-exported from agent-defs.ts.
 *
 * Mirrors the Claude Code `.claude/agents/*.md` model: a markdown file whose
 * flat frontmatter declares a subagent type (`name`, `description`, an optional
 * `tools` allowlist, an optional `model`) and whose body becomes that type's
 * system prompt.
 */

/**
 * A custom (operator-defined) subagent type parsed from a markdown file.
 *
 * `allowTools` undefined = unrestricted (the worker is offered every present
 * tool, same as the general-purpose default); an array = an explicit allowlist.
 * `model` undefined = inherit the active model. `systemPrompt` is the file body.
 */
export type CustomAgentDef = {
  /** Type name resolvers match on (from frontmatter `name`, else a filename slug). */
  readonly name: string;
  /** One-line description (frontmatter `description`, empty if absent). */
  readonly description: string;
  /** Optional tool allowlist (frontmatter `tools`); undefined = unrestricted. */
  readonly allowTools?: readonly string[];
  /** Optional model override (frontmatter `model`); undefined = inherit. */
  readonly model?: string;
  /** The markdown body (frontmatter stripped) used as the worker system prompt. */
  readonly systemPrompt: string;
};

/** Anchored frontmatter block: opening fence, the block, closing fence. The lazy
 *  body capture lets the FIRST "\n---" close it; no second fence => no match =>
 *  the whole input is the body (the no-frontmatter case). Mirrors
 *  skills/frontmatter.ts + prompt/output-styles.ts. */
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/** Reduce a string to a safe lowercase slug; empty input → "agent". */
function slugify(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "agent";
}

/** Parse "[a, b, c]" or bare "a, b, c" into a clean name list; empties dropped. */
function parseToolList(value: string): string[] {
  const inner = value.replace(/^\[(.*)\]$/s, "$1");
  return inner
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** The flat-frontmatter fields a custom agent def reads. */
type AgentFront = {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
};

/** Read flat "key: value" frontmatter into the agent-def fields. Split on the
 *  FIRST colon only (values may contain colons). Unknown keys ignored. */
function parseFrontmatter(block: string): AgentFront {
  const front: AgentFront = { name: "", description: "" };
  for (const line of block.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key === "name") front.name = value;
    else if (key === "description") front.description = value;
    else if (key === "tools") front.tools = parseToolList(value);
    else if (key === "model") front.model = value || undefined;
  }
  return front;
}

/**
 * Parse an agent-def markdown file into a {@link CustomAgentDef} (PURE).
 * The leading `---\n…\n---\n` frontmatter (if any) yields name/description/tools/
 * model; the remainder is the trimmed body → `systemPrompt`. Tolerant: with no
 * frontmatter, or a frontmatter that omits `name`, the name falls back to a slug
 * (of `fallbackName` when given — typically the filename — else the body's first
 * line). A missing `tools` key leaves `allowTools` undefined (unrestricted). An
 * empty body yields a minimal def (empty `systemPrompt`) — still a usable type.
 */
export function parseAgentDef(fileText: string, fallbackName = ""): CustomAgentDef {
  const match = fileText.match(FRONTMATTER_RE);
  const front = match ? parseFrontmatter(match[1] ?? "") : { name: "", description: "" };
  const body = (match ? fileText.slice(match[0].length) : fileText).trim();
  const slugSource = fallbackName.trim() || (body.split("\n")[0] ?? "");
  const def: CustomAgentDef = {
    name: front.name.trim() || slugify(slugSource),
    description: front.description.trim(),
    systemPrompt: body,
  };
  // Only attach optional fields when present (keeps `allowTools` undefined =
  // unrestricted, and `model` undefined = inherit).
  return {
    ...def,
    ...(front.tools && front.tools.length > 0 ? { allowTools: front.tools } : {}),
    ...(front.model ? { model: front.model } : {}),
  };
}
