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

/** One selectable line in the per-item picker. */
export type NumberedItem = { n: number; kind: "skill" | "mcp" | "model"; name: string };

/** Flatten a plan's importable items into a numbered list (skills, then MCP, then model). Pure. */
export function numberedItems(plan: MigrationPlan): NumberedItem[] {
  const items: NumberedItem[] = [];
  let n = 1;
  for (const s of plan.skills) items.push({ n: n++, kind: "skill", name: s.name });
  for (const m of plan.mcpServers) items.push({ n: n++, kind: "mcp", name: m.name });
  if (plan.modelConfig) items.push({ n: n++, kind: "model", name: `${plan.modelConfig.provider ?? "?"}/${plan.modelConfig.model ?? "?"}` });
  return items;
}

/** Render the numbered picker list. Pure. */
export function numberedList(items: NumberedItem[]): string {
  return ["  Select items to import:", ...items.map((i) => `    [${i.n}] ${i.kind}: ${i.name}`)].join("\n");
}

/** The valid 1-based numbers a single picker token contributes (a number or `a-b` range). Pure. */
function partNumbers(part: string, count: number): number[] {
  const range = part.match(/^(\d+)-(\d+)$/);
  if (range) {
    const out: number[] = [];
    for (let i = Number(range[1]); i <= Number(range[2]); i++) if (i >= 1 && i <= count) out.push(i);
    return out;
  }
  const num = Number(part);
  return Number.isInteger(num) && num >= 1 && num <= count ? [num] : [];
}

/** Parse a picker answer into selected 1-based numbers. "all"/""→all, "none"→none,
 *  else a comma/space list with optional `a-b` ranges (out-of-range dropped). Pure. */
export function parseItemSelection(input: string, count: number): Set<number> {
  const t = input.trim().toLowerCase();
  if (t === "" || t === "all" || t === "a") return new Set(Array.from({ length: count }, (_, i) => i + 1));
  if (t === "none" || t === "n") return new Set();
  const out = new Set<number>();
  for (const part of t.split(/[,\s]+/).filter(Boolean)) for (const n of partNumbers(part, count)) out.add(n);
  return out;
}

/** Drop everything not in `selected` from the plan. Pure. */
export function filterPlanByNumbers(plan: MigrationPlan, items: NumberedItem[], selected: Set<number>): MigrationPlan {
  const chosen = items.filter((i) => selected.has(i.n));
  const skillNames = new Set(chosen.filter((i) => i.kind === "skill").map((i) => i.name));
  const mcpNames = new Set(chosen.filter((i) => i.kind === "mcp").map((i) => i.name));
  return {
    ...plan,
    skills: plan.skills.filter((s) => skillNames.has(s.name)),
    mcpServers: plan.mcpServers.filter((m) => mcpNames.has(m.name)),
    modelConfig: chosen.some((i) => i.kind === "model") ? plan.modelConfig : null,
  };
}

/** Pre-narrow the plan to the footprints allowed by flags (--skills/--mcp/--model). Pure. */
export function narrowByFootprint(plan: MigrationPlan, sel: { skills: boolean; mcp: boolean; model: boolean }): MigrationPlan {
  return {
    ...plan,
    skills: sel.skills ? plan.skills : [],
    mcpServers: sel.mcp ? plan.mcpServers : [],
    modelConfig: sel.model ? plan.modelConfig : null,
  };
}

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
