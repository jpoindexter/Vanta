import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { writeSkill } from "../skills/store.js";
import { storeDir } from "../cli-dx/backup.js";
import { upsertEnv } from "../setup.js";
import type { MigrationPlan } from "./plan.js";
import type { McpServer } from "./parse.js";

// VANTA-MIGRATE — the apply step. The single side-effecting boundary: it BACKS UP
// ~/.vanta first (reversible — Rule Zero), then writes only the SELECTED, non-
// conflicting items (a conflict is skipped unless `overwrite`). Backup + the
// writers are injected so the orchestration is unit-tested without touching the
// real store or tar.

export type ApplySelection = { skills: boolean; mcp: boolean; model: boolean; overwrite: boolean };

export type ApplyDeps = {
  env: NodeJS.ProcessEnv;
  /** Snapshot ~/.vanta before any write; returns the archive path (or throws). */
  backup: () => Promise<string>;
  /** Persist one skill (defaults to the real writeSkill). */
  writeSkill: typeof writeSkill;
  /** Read/replace the ~/.vanta/mcp.json text (defaults to fs). */
  readMcpJson: () => Promise<string | null>;
  writeMcpJson: (text: string) => Promise<void>;
  /** Read/replace the store .env text (defaults to fs). */
  readStoreEnv: () => Promise<string>;
  writeStoreEnv: (text: string) => Promise<void>;
};

export type ApplyResult = {
  backup: string;
  skillsAdded: string[];
  mcpAdded: string[];
  modelApplied: boolean;
  skipped: string[];
};

/** Merge selected, non-conflicting MCP servers into the store's mcp.json text. Pure. */
export function mergeMcpServers(existingJson: string | null, incoming: Record<string, McpServer>): string {
  let current: { servers?: Record<string, unknown>; mcpServers?: Record<string, unknown> } = {};
  if (existingJson) {
    try {
      current = JSON.parse(existingJson);
    } catch {
      current = {};
    }
  }
  const servers: Record<string, unknown> = { ...(current.mcpServers ?? {}), ...(current.servers ?? {}) };
  for (const [name, server] of Object.entries(incoming)) servers[name] = server;
  return `${JSON.stringify({ servers }, null, 2)}\n`;
}

/** Map a source provider/model onto Vanta's env keys. Pure. */
export function modelEnvUpdates(model: { provider?: string; model?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  if (model.provider) out.VANTA_PROVIDER = model.provider.toLowerCase();
  if (model.model) out.VANTA_MODEL = model.model;
  return out;
}

/**
 * Apply the selected parts of a migration plan. Backs up first; conflicts are
 * skipped unless `selection.overwrite`. Best-effort per skill so one bad skill
 * doesn't abort the rest. Never runs when the plan found no source.
 */
async function applySkills(plan: MigrationPlan, overwrite: boolean, deps: ApplyDeps, result: ApplyResult): Promise<void> {
  for (const s of plan.skills) {
    if (s.conflict && !overwrite) {
      result.skipped.push(`skill ${s.name} (exists)`);
      continue;
    }
    try {
      await deps.writeSkill({ name: s.skill.name, description: s.skill.description, body: s.skill.body, tags: [...s.skill.tags, `migrated:${plan.source}`] }, { env: deps.env });
      result.skillsAdded.push(s.name);
    } catch {
      result.skipped.push(`skill ${s.name} (write failed)`);
    }
  }
}

async function applyMcp(plan: MigrationPlan, overwrite: boolean, deps: ApplyDeps, result: ApplyResult): Promise<void> {
  const incoming: Record<string, McpServer> = {};
  for (const m of plan.mcpServers) {
    if (m.conflict && !overwrite) result.skipped.push(`mcp ${m.name} (exists)`);
    else {
      incoming[m.name] = m.server;
      result.mcpAdded.push(m.name);
    }
  }
  if (Object.keys(incoming).length) await deps.writeMcpJson(mergeMcpServers(await deps.readMcpJson(), incoming));
}

async function applyModel(plan: MigrationPlan, deps: ApplyDeps, result: ApplyResult): Promise<void> {
  if (!plan.modelConfig) return;
  const updates = modelEnvUpdates(plan.modelConfig);
  if (!Object.keys(updates).length) return;
  await deps.writeStoreEnv(upsertEnv(await deps.readStoreEnv(), updates));
  result.modelApplied = true;
}

export async function applyMigration(plan: MigrationPlan, selection: ApplySelection, deps: ApplyDeps): Promise<ApplyResult> {
  const backup = await deps.backup();
  const result: ApplyResult = { backup, skillsAdded: [], mcpAdded: [], modelApplied: false, skipped: [] };
  if (selection.skills) await applySkills(plan, selection.overwrite, deps, result);
  if (selection.mcp) await applyMcp(plan, selection.overwrite, deps, result);
  if (selection.model) await applyModel(plan, deps, result);
  return result;
}

/** Build the live apply deps (real backup/fs/writeSkill) for `vanta migrate`. */
export function defaultApplyDeps(env: NodeJS.ProcessEnv, backup: () => Promise<string>): ApplyDeps {
  const home = storeDir(env);
  const mcpPath = join(home, "mcp.json");
  const envPath = join(home, ".env");
  return {
    env,
    backup,
    writeSkill,
    readMcpJson: () => readFile(mcpPath, "utf8").catch(() => null),
    writeMcpJson: async (text) => {
      await mkdir(home, { recursive: true });
      await writeFile(mcpPath, text, "utf8");
    },
    readStoreEnv: () => readFile(envPath, "utf8").catch(() => ""),
    writeStoreEnv: async (text) => {
      await mkdir(home, { recursive: true });
      await writeFile(envPath, text, "utf8");
    },
  };
}
