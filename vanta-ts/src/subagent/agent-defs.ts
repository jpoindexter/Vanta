/**
 * VANTA-AGENTS-DIR — custom agent TYPES from markdown files (PURE).
 *
 * Mirrors the Claude Code `.claude/agents/*.md` model: a markdown file whose
 * flat frontmatter declares a subagent type (`name`, `description`, an optional
 * `tools` allowlist, an optional `model`) and whose body becomes that type's
 * system prompt. Defs are discoverable in two dirs (project `.claude/agents/` +
 * user `~/.vanta/agents/`) and resolve ALONGSIDE the built-in agent types — a
 * custom def WINS on a name clash, so an operator can override a built-in.
 *
 * Everything here is PURE + injectable — the dir/file readers are passed in, so
 * no real disk is touched in tests. No files = the built-ins only (current
 * behavior, unchanged).
 *
 * NOT WIRED into the live delegate/spawn this round (deliberate — delivered as
 * the pure parser + loader + resolution + tests). NAMED wire-up points (mirrors
 * how builtin-agents.ts names its consumers):
 *   - `tools/delegate.ts` `runDelegate`: load `listAgentDefs(deps)` once, then
 *     `resolveAgentType(args.agent_type, customDefs)` — a custom def carries its
 *     own `systemPrompt` (injected into the worker's prompt) and `allowTools`
 *     (feeds the same `exclude` computation builtin-agents names; intersect with
 *     the child registry, never grant an absent/kernel-blocked tool).
 *   - `subagent/spawn.ts`: when the resolved type is a CustomAgentDef, use its
 *     `systemPrompt` as the worker persona and its `model` (if set) as the
 *     worker's provider model override.
 *   - a `generate-agent` surface would write a new `.claude/agents/<name>.md`
 *     that this loader then picks up.
 * SECURITY: a custom def's tools/prompt still flow through the kernel-gated
 * dispatch — a custom def can NOT grant a tool the kernel blocks; `allowTools`
 * only narrows which present tools the worker is offered.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { resolveBuiltinAgent, type BuiltinAgentType } from "./builtin-agents.js";
import { parseAgentDef, type CustomAgentDef } from "./agent-def-parse.js";

// Re-export the parser surface so importers keep one public API at this path.
export { parseAgentDef } from "./agent-def-parse.js";
export type { CustomAgentDef } from "./agent-def-parse.js";

/** Deps for listing custom agent defs — injected so no real disk in tests. */
export type AgentDefsDeps = {
  /** The directories to scan, in precedence order (earlier wins on name clash). */
  dirs: string[];
  /** List the `*.md` file basenames in a dir (return [] for a missing dir). */
  listMd: (dir: string) => string[];
  /** Read a file's text (return null for a missing/unreadable file). */
  readText: (path: string) => string | null;
};

/** Strip a trailing `.md` (case-insensitive) for use as the slug fallback. */
function stripMd(file: string): string {
  return file.replace(/\.md$/i, "");
}

/**
 * List the available custom agent defs across the injected dirs (PURE over deps).
 * Earlier dirs win on a name collision (project overrides user). Files that read
 * as null are skipped. Order: discovery order within precedence.
 */
export function listAgentDefs(deps: AgentDefsDeps): CustomAgentDef[] {
  const byName = new Map<string, CustomAgentDef>();
  for (const dir of deps.dirs) {
    for (const file of deps.listMd(dir)) {
      if (!/\.md$/i.test(file)) continue;
      const text = deps.readText(join(dir, file));
      if (text === null) continue;
      const def = parseAgentDef(text, stripMd(file));
      const key = def.name.toLowerCase();
      // First writer wins → earlier dirs (project) override later (user).
      if (!byName.has(key)) byName.set(key, def);
    }
  }
  return [...byName.values()];
}

/**
 * Default agent-def directories: the project's `.claude/agents/` (highest
 * precedence) then the user's `~/.vanta/agents/`. Pure given `root`/`home` (both
 * injectable for tests; `home` defaults to the real home dir). A wiring site
 * builds {@link AgentDefsDeps} from this plus real `listMd`/`readText`.
 */
export function defaultAgentDirs(root: string, home: string = homedir()): string[] {
  return [join(root, ".claude", "agents"), join(home, ".vanta", "agents")];
}

/** What `resolveAgentType` returns — a custom def, or a built-in type. */
export type ResolvedAgentType = CustomAgentDef | BuiltinAgentType;

/** True when a resolved type is operator-defined (carries a `systemPrompt`). */
export function isCustomAgentDef(type: ResolvedAgentType): type is CustomAgentDef {
  return Object.prototype.hasOwnProperty.call(type, "systemPrompt");
}

/**
 * Resolve a requested type name against the custom defs MERGED with the built-in
 * types (PURE). Matching is case-insensitive. A custom def WINS on a name clash
 * (operator override). When no custom def matches, falls back to
 * {@link resolveBuiltinAgent} — so a built-in name resolves to its built-in type
 * and an unknown/empty name resolves to the general-purpose built-in default
 * (current behavior = full tool set). Reuses the built-in resolver for the
 * fallback; never returns nothing.
 */
export function resolveAgentType(
  name: string | null | undefined,
  customDefs: readonly CustomAgentDef[],
  builtins: (n?: string | null) => BuiltinAgentType = resolveBuiltinAgent,
): ResolvedAgentType {
  const key = (name ?? "").trim().toLowerCase();
  if (key.length > 0) {
    const custom = customDefs.find((d) => d.name.toLowerCase() === key);
    if (custom) return custom; // custom wins on a clash
  }
  return builtins(name);
}
