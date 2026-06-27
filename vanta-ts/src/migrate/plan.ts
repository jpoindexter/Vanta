import { join } from "node:path";
import { redactSecrets } from "../store/secret-scan.js";
import { SOURCE_LAYOUTS, parseSourceSkill, parseMcpServers, parseModelConfig } from "./parse.js";
import type { MigrateSource, McpServer, ModelConfig, ParsedSkill } from "./parse.js";

// VANTA-MIGRATE — the PURE migration plan. Like purge-plan.ts it does NO I/O and
// nothing destructive: injected read-only fs deps enumerate what a migration WOULD
// bring in, flag conflicts with what ~/.vanta already has (never overwrite without
// approval), and redact secrets for the preview. The apply step is separate.

/** Read-only filesystem reads, injected so the planner is pure + testable. */
export type PlanDeps = {
  /** Absolute source root, e.g. ~/.openclaw. */
  sourceRoot: string;
  exists: (path: string) => boolean;
  readText: (path: string) => string | null;
  /** Immediate subdir names of a dir (for the skills/ tree); [] if absent. */
  listDirs: (path: string) => string[];
  /** Names already present in ~/.vanta (skills + mcp servers) → conflict flags. */
  existingSkillNames: ReadonlySet<string>;
  existingMcpNames: ReadonlySet<string>;
};

export type SkillItem = { name: string; description: string; skill: ParsedSkill; conflict: boolean };
export type McpItem = { name: string; server: McpServer; conflict: boolean; secretKeys: string[] };
export type MigrationPlan = {
  source: MigrateSource;
  sourceRoot: string;
  found: boolean;
  skills: SkillItem[];
  mcpServers: McpItem[];
  modelConfig: ModelConfig | null;
  notes: string[];
};

/** Env var names in an MCP server's `env` that carry a secret-shaped value. */
function secretEnvKeys(server: McpServer): string[] {
  const env = server.env ?? {};
  return Object.entries(env)
    .filter(([k, v]) => /key|token|secret|password|api/i.test(k) || redactSecrets(v) !== v)
    .map(([k]) => k);
}

function planSkills(deps: PlanDeps, skillsRel: string): SkillItem[] {
  const root = join(deps.sourceRoot, skillsRel);
  const items: SkillItem[] = [];
  for (const slug of deps.listDirs(root)) {
    const md = deps.readText(join(root, slug, "SKILL.md")) ?? deps.readText(join(root, `${slug}.md`));
    if (md === null) continue;
    const parsed = parseSourceSkill(md, slug);
    if (!parsed) continue;
    items.push({ name: parsed.name, description: parsed.description, skill: parsed, conflict: deps.existingSkillNames.has(parsed.name) });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

/** First config file whose parsed value is non-empty — so MCP and model config can
 *  live in different files. Pure. */
function findInConfigs<T>(
  deps: PlanDeps,
  files: readonly string[],
  pick: (text: string) => T,
  nonEmpty: (value: T) => boolean,
): { value: T; file: string } | null {
  for (const f of files) {
    const text = deps.readText(join(deps.sourceRoot, f));
    if (text === null) continue;
    const value = pick(text);
    if (nonEmpty(value)) return { value, file: f };
  }
  return null;
}

/** Build the migration plan. Pure (all I/O injected). */
export function buildMigrationPlan(source: MigrateSource, deps: PlanDeps): MigrationPlan {
  const layout = SOURCE_LAYOUTS[source];
  const notes: string[] = [];
  if (!deps.exists(deps.sourceRoot)) {
    return { source, sourceRoot: deps.sourceRoot, found: false, skills: [], mcpServers: [], modelConfig: null, notes: [`no ${source} store at ${deps.sourceRoot}`] };
  }

  const skills = planSkills(deps, layout.skillsDir);

  const mcpFound = findInConfigs(deps, layout.configFiles, parseMcpServers, (v) => Object.keys(v).length > 0);
  const mcpServers: McpItem[] = Object.entries(mcpFound?.value ?? {}).map(([name, server]) => ({
    name,
    server,
    conflict: deps.existingMcpNames.has(name),
    secretKeys: secretEnvKeys(server),
  }));

  const modelFound = findInConfigs(deps, layout.configFiles, parseModelConfig, (v) => Boolean(v.provider || v.model));
  const modelConfig = modelFound?.value ?? null;

  if (mcpFound) notes.push(`config: ${mcpFound.file}`);
  const conflicts = skills.filter((s) => s.conflict).length + mcpServers.filter((m) => m.conflict).length;
  if (conflicts) notes.push(`${conflicts} item(s) already exist in ~/.vanta — skipped unless --overwrite`);

  return { source, sourceRoot: deps.sourceRoot, found: true, skills, mcpServers, modelConfig, notes };
}

function skillLines(plan: MigrationPlan): string[] {
  const out = [`  Skills (${plan.skills.length}):`];
  for (const s of plan.skills) out.push(`    ${s.conflict ? "•(exists)" : "+"} ${s.name} — ${redactSecrets(s.description).slice(0, 60)}`);
  if (!plan.skills.length) out.push("    (none)");
  return out;
}

function mcpLine(m: McpItem): string {
  const detail = m.server.command ? `${m.server.command} ${(m.server.args ?? []).join(" ")}`.trim() : m.server.url ?? "";
  const sec = m.secretKeys.length ? `  [secrets: ${m.secretKeys.join(", ")} → redacted]` : "";
  return `    ${m.conflict ? "•(exists)" : "+"} ${m.name} — ${redactSecrets(detail).slice(0, 70)}${sec}`;
}

function mcpLines(plan: MigrationPlan): string[] {
  const out = ["", `  MCP servers (${plan.mcpServers.length}):`, ...plan.mcpServers.map(mcpLine)];
  if (!plan.mcpServers.length) out.push("    (none)");
  return out;
}

function modelLines(plan: MigrationPlan): string[] {
  const m = plan.modelConfig;
  return ["", "  Model config:", m ? `    + ${m.provider ?? "?"} / ${m.model ?? "?"}` : "    (none)"];
}

// The per-item PICKER lives in plan-selection.ts (one cohesive concern: flatten →
// select → narrow). Re-exported here so importers use the same module path.
export {
  numberedItems,
  numberedList,
  parseItemSelection,
  filterPlanByNumbers,
  narrowByFootprint,
} from "./plan-selection.js";
export type { NumberedItem } from "./plan-selection.js";

/** Render the plan as a redacted, operator-facing preview. Pure — never prints a secret. */
export function formatPlan(plan: MigrationPlan): string {
  if (!plan.found) return `  no ${plan.source} store found at ${plan.sourceRoot} — nothing to migrate.`;
  return [
    "",
    `  ⇪ Migrate from ${plan.source}  (${plan.sourceRoot})`,
    "",
    ...skillLines(plan),
    ...mcpLines(plan),
    ...modelLines(plan),
    ...plan.notes.map((n) => `  · ${n}`),
    "",
  ].join("\n");
}
