/**
 * VANTA-AGENTS-DIR — custom agent TYPES from markdown files (PURE).
 *
 * Mirrors the Claude Code `.claude/agents/*.md` model: a markdown file whose
 * flat frontmatter declares a prompt/agent type (`name`, `description`, an optional
 * `tools` allowlist, an optional `model`) and whose body becomes that type's
 * system prompt. Defs are discoverable in two dirs (project `.claude/agents/` +
 * user `~/.vanta/agents/`) and resolve ALONGSIDE the built-in agent types — a
 * custom def WINS on a name clash, so an operator can override a built-in.
 *
 * The pure parser/list seam is injectable; `loadAgentDefs` is the production
 * disk adapter used by `/prompt` and `delegate {agent_type}`.
 * SECURITY: a custom def's tools/prompt still flow through the kernel-gated
 * dispatch — a custom def can NOT grant a tool the kernel blocks; `allowTools`
 * only narrows which present tools the worker is offered.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

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
 * Default definition directories in precedence order: project-native
 * `.vanta/agents`, compatible `.claude/agents`, then the Vanta home `agents`.
 */
export function defaultAgentDirs(root: string, vantaHome: string = resolveVantaHome()): string[] {
  return [join(root, ".vanta", "agents"), join(root, ".claude", "agents"), join(vantaHome, "agents")];
}

/** Load project + Vanta-home definitions from disk. Missing/unreadable dirs fail closed to []. */
export function loadAgentDefs(root: string, env: NodeJS.ProcessEnv = process.env): CustomAgentDef[] {
  const dirs = defaultAgentDirs(root, resolveVantaHome(env));
  return listAgentDefs({
    dirs,
    listMd: (dir) => {
      try { return readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".md")); }
      catch { return []; }
    },
    readText: (path) => {
      try { return readFileSync(path, "utf8"); }
      catch { return null; }
    },
  });
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
