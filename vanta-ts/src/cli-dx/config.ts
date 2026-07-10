import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { envPath as getEnvPath, upsertEnvMigratingLegacy, removeEnvKeys } from "../setup.js";
import { mirrorLegacyEnv } from "../env-compat.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import { appendRevision, getRevision, latestRevision, listRevisions, type ConfigRevision } from "./config-revisions.js";

export const envPath = getEnvPath;

/** Project-local revision store dir for this repo's .env (PCLIP-CONFIG-REVISION). */
function revisionsDataDir(repoRoot: string): string {
  return join(repoRoot, ".vanta");
}

/** Snapshot the CURRENT .env content as a revision before it gets replaced. */
async function snapshotBeforeWrite(repoRoot: string, note?: string): Promise<void> {
  const path = getEnvPath(repoRoot);
  const current = existsSync(path) ? await readFile(path, "utf-8") : "";
  await appendRevision(revisionsDataDir(repoRoot), current, note);
}

const VANTA_KEYS = [
  "VANTA_PROVIDER",
  "VANTA_MODEL",
  "VANTA_OLLAMA_URL",
  "VANTA_VISION_MODEL",
  "VANTA_VISION_PROVIDER",
  "VANTA_KERNEL_URL",
  "VANTA_MAX_ITER",
  "VANTA_HOME",
  "VANTA_MEMORY_MAX_BLOCKS",
  "VANTA_SPINNER",
  "VANTA_SEARCH_PROVIDER",
  "VANTA_SEARCH_URL",
  "VANTA_ALLOWED_DOMAINS",
  "VANTA_PROJECTS_DIR",
  "VANTA_MODEL_CHEAP",
  "VANTA_MODEL_EXPENSIVE",
  "VANTA_INHIBIT_THRESHOLD",
  "VANTA_SETSHIFT_THRESHOLD",
  "VANTA_MODE_DETECT",
  "VANTA_AUTOHANDOFF_THRESHOLD",
  "VANTA_GOAL_ACTION",
  "VANTA_RELAUNCH",
  "VANTA_LINT_BLOCK",
  "VANTA_EDITOR",
  "VANTA_TOOL_RETRIES",
  "VANTA_STALL_THRESHOLD",
  "VANTA_SELF_IMPROVE",
  "VANTA_REVIEW_MIN_TOOLS",
  "VANTA_REVIEW_EVERY",
  "VANTA_TELEGRAM_TOKEN",
  "VANTA_GATEWAY_TICK_MS",
  "VANTA_TEAMS_APP_ID",
  "VANTA_TEAMS_APP_PASSWORD",
  "VANTA_TEAMS_ALLOWLIST",
  "VANTA_MESSAGING_WEBHOOK_HOST",
  "VANTA_MESSAGING_WEBHOOK_PORT",
  "VANTA_WEBHOOK_PORT",
  "VANTA_WEBHOOK_SECRET",
  "VANTA_WEBHOOK_PROMPT",
  "VANTA_WEBHOOK_DELIVER",
  "VANTA_MCP_SERVE_TOOLS",
];

const SECRET_SUFFIXES = ["_KEY", "_SECRET", "_TOKEN", "_PASSWORD"];
const isSensitive = (key: string): boolean => SECRET_SUFFIXES.some((s) => key.includes(s));

function parseEnvText(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    const k = key?.trim();
    if (k && !k.startsWith("#")) env[k] = valueParts.join("=");
  }
  return env;
}

function printEnvBlock(label: string, keys: string[], env: Record<string, string>): void {
  console.log(label);
  for (const key of keys) {
    const display = isSensitive(key) ? "[REDACTED]" : env[key];
    console.log(`  ${key}=${display}`);
  }
}

/**
 * Show the current Vanta config from .env. Shows VANTA_* and provider keys.
 * Masks secrets with [REDACTED].
 */
export async function showConfig(repoRoot: string): Promise<void> {
  const path = getEnvPath(repoRoot);
  const text = existsSync(path) ? await readFile(path, "utf-8") : "";
  const env = parseEnvText(text);

  const active = Object.keys(env)
    .filter((k) => (k.startsWith("VANTA_") || k.endsWith("_KEY") || k.endsWith("_SECRET")) && env[k])
    .sort();
  const argo = Object.keys(env)
    .filter((k) => k.startsWith("ARGO_") && env[k])
    .sort();

  if (active.length === 0 && argo.length === 0) {
    console.log("No Vanta config found. Run `vanta setup` to initialize.");
    return;
  }

  if (active.length > 0) printEnvBlock("Active Vanta Configuration:", active, env);

  if (argo.length > 0) {
    printEnvBlock("\n⚠  Legacy ARGO_* config found (mirrored by compat layer):", argo, env);
    console.log("\nRun `vanta config migrate` to clean these up.");
  }
}

/**
 * Open the .env file in the user's editor for manual editing.
 */
export async function editConfig(repoRoot: string): Promise<void> {
  const path = envPath(repoRoot);
  const { execSync } = await import("node:child_process");

  const editor = process.env.VANTA_EDITOR || process.env.VISUAL || process.env.EDITOR || "code";
  try {
    execSync(`${editor} "${path}"`, { stdio: "inherit" });
    console.log("Config saved.");
  } catch (err) {
    console.error(`Failed to open editor: ${editor}`);
    throw err;
  }
}

/**
 * Migrate legacy ARGO_* config to VANTA_* by reading the file,
 * extracting the ARGO_ values, and writing them as VANTA_ equivalents
 * while removing the old ARGO_ lines.
 */
export async function migrateConfig(repoRoot: string): Promise<void> {
  const path = envPath(repoRoot);
  if (!existsSync(path)) {
    console.log("No .env file found. Nothing to migrate.");
    return;
  }

  const text = await readFile(path, "utf-8");
  const argoPattern = /^(ARGO_[A-Z0-9_]+)=/m;

  if (!argoPattern.test(text)) {
    console.log("No ARGO_* config found. Already migrated.");
    return;
  }

  const updates: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^ARGO_([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && match[1] && match[2] !== undefined) {
      updates[`VANTA_${match[1]}`] = match[2];
    }
  }

  const argoKeys = Object.keys(updates).map((k) => k.replace("VANTA_", "ARGO_"));
  const migrated = removeEnvKeys(text, argoKeys);
  const final = upsertEnvMigratingLegacy(migrated, updates);

  await snapshotBeforeWrite(repoRoot, `migrate: ${Object.keys(updates).join(", ")}`);
  await writeFile(path, final, { mode: 0o600 });
  await fireHooks(join(repoRoot, ".vanta"), "ConfigChange", { source: "project_settings", path, keys: Object.keys(updates) }, { cwd: repoRoot, matcherValue: "project_settings" });
  console.log(`Migrated ${Object.keys(updates).length} ARGO_* keys to VANTA_*.`);
  console.log("Removed legacy ARGO_* entries.");
}

/** Read one setting from .env (secrets masked). Returns the printable line. */
export async function getConfig(repoRoot: string, key: string): Promise<string> {
  const path = getEnvPath(repoRoot);
  const env = parseEnvText(existsSync(path) ? await readFile(path, "utf-8") : "");
  const v = env[key];
  if (!v) return `${key} is unset`;
  return `${key}=${isSensitive(key) ? "[REDACTED]" : v}`;
}

/** Set one setting in .env (merges; never echoes a secret value). */
export async function setConfig(repoRoot: string, key: string, value: string): Promise<string> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return `invalid key "${key}" — use UPPER_SNAKE_CASE`;
  const path = getEnvPath(repoRoot);
  const existing = existsSync(path) ? await readFile(path, "utf-8") : "";
  await snapshotBeforeWrite(repoRoot, `set ${key}`);
  await writeFile(path, upsertEnvMigratingLegacy(existing, { [key]: value }), { mode: 0o600 });
  await fireHooks(join(repoRoot, ".vanta"), "ConfigChange", { source: "project_settings", path, key }, { cwd: repoRoot, matcherValue: "project_settings" });
  return isSensitive(key) ? `✓ ${key} set (hidden) → .env` : `✓ ${key}=${value} → .env`;
}

/** List recorded .env revisions, newest first (secrets NOT shown — content is
 *  the raw prior .env text, so callers must mask before printing). */
export async function listConfigRevisions(repoRoot: string): Promise<ConfigRevision[]> {
  return (await listRevisions(revisionsDataDir(repoRoot))).slice().reverse();
}

/** Format a revision listing with secrets masked per-line (mirrors printEnvBlock). */
export function formatRevisionList(revisions: ConfigRevision[]): string {
  if (revisions.length === 0) return "No config revisions recorded yet.";
  return revisions
    .map((r) => `rev ${r.rev}  ${r.ts}${r.note ? `  (${r.note})` : ""}`)
    .join("\n");
}

/**
 * Restore .env to a prior revision. `rev` omitted → the most recently recorded
 * snapshot (undo the last change). The CURRENT content is snapshotted first, so
 * a rollback is itself a recorded, reversible revision — never a dead end.
 */
export async function rollbackConfig(repoRoot: string, rev?: number): Promise<string> {
  const dataDir = revisionsDataDir(repoRoot);
  const target = rev === undefined ? await latestRevision(dataDir) : await getRevision(dataDir, rev);
  if (!target) {
    return rev === undefined
      ? "no config revisions recorded yet — nothing to roll back to"
      : `revision ${rev} not found — run \`vanta config revisions\` to list what's available`;
  }
  const path = getEnvPath(repoRoot);
  await snapshotBeforeWrite(repoRoot, `rollback to rev ${target.rev}`);
  await writeFile(path, target.content, { mode: 0o600 });
  await fireHooks(join(repoRoot, ".vanta"), "ConfigChange", { source: "project_settings", path, key: `rollback:rev${target.rev}` }, { cwd: repoRoot, matcherValue: "project_settings" });
  return `✓ restored .env to revision ${target.rev} (${target.ts})`;
}

/** Validate .env: provider chosen + its key present. The common "configured but no key" check. */
export async function checkConfig(repoRoot: string): Promise<string> {
  const path = getEnvPath(repoRoot);
  if (!existsSync(path)) return "no .env — run `vanta setup`";
  const env = parseEnvText(await readFile(path, "utf-8"));
  const provider = env.VANTA_PROVIDER;
  const issues: string[] = [];
  if (!provider) issues.push("VANTA_PROVIDER not set — run `vanta setup`");
  else {
    const entry = PROVIDER_CATALOG.find((p) => p.id === provider);
    if (!entry) issues.push(`VANTA_PROVIDER="${provider}" is not a known provider`);
    else if (entry.envVar && !env[entry.envVar]) issues.push(`${entry.label} needs ${entry.envVar} — not set`);
  }
  const n = Object.keys(env).filter((k) => k.startsWith("VANTA_") && env[k]).length;
  return issues.length ? "⚠ " + issues.join("; ") : `✓ config valid — ${n} VANTA_* settings, provider ${provider} ready`;
}
