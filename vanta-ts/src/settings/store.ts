import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { EFFORT_LEVELS } from "../types.js";

// Layered settings.json (user → project → local).
// Non-secret config (permissions, allowed tools, ui prefs).
// Merges three scopes; local wins.

export const SettingsSchema = z.object({
  /** Tool names always approved without a prompt. */
  allowedTools: z.array(z.string()).optional(),
  /** Tool names always blocked. */
  blockedTools: z.array(z.string()).optional(),
  /** VANTA_* env overrides applied on top of .env. Non-secret only. */
  env: z.record(z.string()).optional(),
  /** Disable individual EF gates. */
  gates: z.object({
    antiSlop: z.boolean().optional(),
    modeDetect: z.boolean().optional(),
    researchGate: z.boolean().optional(),
    stallUnblock: z.boolean().optional(),
  }).optional(),
  /** Disable the background agent session view and controls. */
  disableAgentView: z.boolean().optional(),
  /** Default model effort for new sessions. */
  effortLevel: z.enum(EFFORT_LEVELS).optional(),
  /** Auto permission mode classifier settings. */
  autoMode: z.object({
    enabled: z.boolean().optional(),
    softDeny: z.boolean().optional(),
    rules: z.array(z.object({
      action: z.enum(["allow", "ask", "soft_deny"]),
      tool: z.string().optional(),
      pattern: z.string().optional(),
      label: z.string().optional(),
    })).optional(),
  }).optional(),
  /** UI preferences. */
  ui: z.object({
    theme: z.string().optional(),
    spinner: z.string().optional(),
    noTui: z.boolean().optional(),
    /** Input box position: "float" (default) or "bottom" (pinned chat box). */
    composerAnchor: z.enum(["float", "bottom"]).optional(),
  }).optional(),
  /** Opt-in runtime plugin framework config. Plugin code is disabled by default. */
  plugins: z.object({
    enabled: z.array(z.string()).optional(),
    trustProjectPlugins: z.boolean().optional(),
  }).optional(),
  /** Shell command whose stdout is used as the API key for the active provider.
   *  Executed at startup; cached for 5 minutes. Example: `'op read op://vault/anthropic/key'` */
  api_key_helper: z.string().optional(),
}).strict().partial();

export type Settings = z.infer<typeof SettingsSchema>;

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return {}; }
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
 * Invalid entries are silently dropped (Zod safeParse).
 */
export async function loadSettings(
  projectRoot: string,
  env?: NodeJS.ProcessEnv,
): Promise<Settings> {
  const [user, project, local] = await Promise.all([
    readJson(userSettingsPath(env)),
    readJson(projectSettingsPath(projectRoot)),
    readJson(localSettingsPath(projectRoot)),
  ]);
  const merged = deepMerge(
    deepMerge(user as Record<string, unknown>, project as Record<string, unknown>),
    local as Record<string, unknown>,
  );
  const parsed = SettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : {};
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
