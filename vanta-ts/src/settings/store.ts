import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { resolveVantaHome } from "../store/home.js";
import { uxSettingsToEnv } from "./ux-settings.js";
import { SettingsSchema, type Settings } from "./schema.js";

export { SettingsSchema, type Settings } from "./schema.js";

// Layered settings.json (user → project → local).
// Non-secret config (permissions, allowed tools, ui prefs).
// Merges three scopes; local wins. The schema lives in `schema.js`.

async function readJson(path: string): Promise<Settings> {
  try {
    // Unknown preferences are ignored, never the recognized policy beside them.
    return SettingsSchema.strip().parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Settings need recovery at ${path}. Inspect and restore valid settings before retrying; nothing was written.`);
  }
}

function userSettingsPath(env?: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "settings.json");
}

function projectSettingsPath(projectRoot: string): string {
  return join(projectRoot, ".vanta", "settings.json");
}

function localSettingsPath(projectRoot: string): string {
  return join(projectRoot, ".vanta", "settings.local.json");
}

/** Legacy cache location, retained for diagnostics; policy is read from source. */
export function settingsCachePath(projectRoot: string, env?: NodeJS.ProcessEnv): string {
  const project = createHash("sha256").update(projectRoot).digest("hex").slice(0, 20);
  return join(resolveVantaHome(env), "cache", "settings", `${project}.json`);
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v) && typeof result[k] === "object" && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Load and merge settings from all three scopes.
 * Missing scopes are empty; corrupt or invalid scopes stop policy loading.
 */
export async function loadSettings(
  projectRoot: string,
  env?: NodeJS.ProcessEnv,
): Promise<Settings> {
  const sources = [
    userSettingsPath(env),
    projectSettingsPath(projectRoot),
    localSettingsPath(projectRoot),
  ];
  // A metadata cache is not authority to drop restrictions in these three files.
  const [user, project, local] = await Promise.all([
    readJson(sources[0]!),
    readJson(sources[1]!),
    readJson(sources[2]!),
  ]);
  const merged = deepMerge(
    deepMerge(user as Record<string, unknown>, project as Record<string, unknown>),
    local as Record<string, unknown>,
  );
  const parsed = SettingsSchema.safeParse(merged);
  if (!parsed.success) throw new Error("Merged settings need recovery; nothing was written.");
  return parsed.data;
}

/** Write to one settings scope. */
export async function writeSettings(
  path: string,
  settings: Settings,
): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

/** Apply settings to process.env (env overrides). Non-destructive: only adds, never removes. */
export function applySettingsEnv(settings: Settings, processEnv: NodeJS.ProcessEnv): void {
  // VANTA-SETTINGS-MEM: autoMemory on → the existing extractor's opt-in flag,
  // only when the operator hasn't already pinned the env (env wins; unset =
  // byte-identical to today's behavior since autoMemory defaults off).
  if (settings.memory?.autoMemory === true && !processEnv.VANTA_EXTRACT_MEMORIES) {
    processEnv.VANTA_EXTRACT_MEMORIES = "1";
  }
  // VANTA-SETTINGS-UX: map the set display/UX fields to their VANTA_* env vars,
  // only when the operator hasn't already pinned the env (env wins; unset =
  // byte-identical to today's behavior since uxSettingsToEnv({}) is empty).
  for (const [k, v] of Object.entries(uxSettingsToEnv(settings.ui))) {
    if (!processEnv[k]) processEnv[k] = v;
  }
  if (settings.ui?.outputStyle && !processEnv.VANTA_OUTPUT_STYLE) {
    processEnv.VANTA_OUTPUT_STYLE = settings.ui.outputStyle;
  }
  if (settings.ui?.promptSuggestionsEnabled !== undefined && !processEnv.VANTA_PROMPT_SUGGESTIONS) {
    processEnv.VANTA_PROMPT_SUGGESTIONS = settings.ui.promptSuggestionsEnabled ? "1" : "0";
  }
  if (!settings.env) return;
  for (const [k, v] of Object.entries(settings.env)) {
    if (!processEnv[k]) processEnv[k] = v;
  }
}

/** True when a tool is in the allowedTools list. */
export function isToolAllowed(toolName: string, settings: Settings): boolean {
  return settings.allowedTools?.includes(toolName) ?? false;
}

/** True when a tool is in the blockedTools list. */
export function isToolBlocked(toolName: string, settings: Settings): boolean {
  return settings.blockedTools?.includes(toolName) ?? false;
}

/** Format settings for display. Pure. */
export function formatSettings(settings: Settings, scope: string): string {
  if (!Object.keys(settings).length) return `  (${scope}: empty)`;
  return `  ${scope}:\n${JSON.stringify(settings, null, 2).split("\n").map((l) => `  ${l}`).join("\n")}`;
}

export { userSettingsPath, projectSettingsPath, localSettingsPath, existsSync };
