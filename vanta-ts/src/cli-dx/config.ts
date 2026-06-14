import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { envPath as getEnvPath, upsertEnvMigratingLegacy, removeEnvKeys } from "../setup.js";
import { mirrorLegacyEnv } from "../env-compat.js";
import { PROVIDER_CATALOG } from "../providers/catalog.js";

export const envPath = getEnvPath;

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

  await writeFile(path, final, { mode: 0o600 });
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
  await writeFile(path, upsertEnvMigratingLegacy(existing, { [key]: value }), { mode: 0o600 });
  return isSensitive(key) ? `✓ ${key} set (hidden) → .env` : `✓ ${key}=${value} → .env`;
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
