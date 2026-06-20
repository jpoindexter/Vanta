import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import {
  SettingsSchema,
  loadSettings,
  writeSettings,
  userSettingsPath,
  type Settings,
} from "../settings/store.js";
import { EFFORT_LEVELS } from "../types.js";

// Per-key value validators for the UPDATABLE settings allowlist. Only flat,
// top-level scalar SettingsSchema keys are updatable through this tool — nested
// objects and arrays (autoMode rules, sshConfigs, plugins) need richer surfaces
// and stay out of reach so a one-line set can never corrupt structured config.
// A key absent from this map is rejected as unsupported, never written.
const UPDATABLE: Record<string, z.ZodTypeAny> = {
  effortLevel: z.enum(EFFORT_LEVELS),
  disableAgentView: z.boolean(),
  includeGitInstructions: z.boolean(),
  respectGitignore: z.boolean(),
  attribution: z.string(),
  prUrlTemplate: z.string(),
  api_key_helper: z.string(),
};

const SUPPORTED_KEYS = Object.keys(UPDATABLE).sort();

const Args = z.object({
  action: z.enum(["get", "list", "path", "set"]),
  key: z.string().min(1).optional(),
  value: z.string().optional(),
});

/** Injectable settings I/O so the tool is unit-tested with no real files. */
export type ConfigDeps = {
  load: (env: NodeJS.ProcessEnv) => Promise<Settings>;
  write: (path: string, settings: Settings) => Promise<void>;
  path: (env: NodeJS.ProcessEnv) => string;
};

const realDeps: ConfigDeps = {
  // User scope is the persist target, so reads use the user file too — a get
  // after a set reflects exactly what was written. projectRoot is irrelevant
  // here; cwd satisfies loadSettings's signature without widening scope.
  load: (env) => loadSettings(process.cwd(), env),
  write: writeSettings,
  path: userSettingsPath,
};

/** Coerce a raw string arg to the type the key's validator expects. Pure. */
function coerce(key: string, value: string): unknown {
  if (UPDATABLE[key] instanceof z.ZodBoolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return value; // let zod reject anything else as a clear error
  }
  return value;
}

/** Build the supported-keys + current-values listing. Pure. */
function formatList(settings: Settings): string {
  const lines = SUPPORTED_KEYS.map((k) => {
    const v = (settings as Record<string, unknown>)[k];
    return `  ${k} = ${v === undefined ? "(unset)" : JSON.stringify(v)}`;
  });
  return `Supported settings (updatable):\n${lines.join("\n")}`;
}

async function runSet(
  key: string | undefined,
  value: string | undefined,
  env: NodeJS.ProcessEnv,
  deps: ConfigDeps,
): Promise<ToolResult> {
  if (!key) return { ok: false, output: "set needs a key" };
  if (value === undefined) return { ok: false, output: `set ${key} needs a value` };
  const validator = UPDATABLE[key];
  if (!validator) {
    return {
      ok: false,
      output: `Setting '${key}' is not updatable. Supported: ${SUPPORTED_KEYS.join(", ")}`,
    };
  }
  const checked = validator.safeParse(coerce(key, value));
  if (!checked.success) {
    return { ok: false, output: `Invalid value for ${key}: ${checked.error.issues[0]?.message ?? "rejected"}` };
  }
  const current = await deps.load(env);
  const next = { ...current, [key]: checked.data };
  const parsed = SettingsSchema.safeParse(next);
  if (!parsed.success) {
    return { ok: false, output: `Setting ${key} failed schema validation` };
  }
  const target = deps.path(env);
  await deps.write(target, parsed.data);
  return { ok: true, output: `Set ${key} = ${JSON.stringify(checked.data)} in ${target}` };
}

async function runConfig(
  raw: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
  deps: ConfigDeps,
): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, output: `Invalid args: ${parsed.error.issues[0]?.message ?? "rejected"}` };
  }
  const { action, key, value } = parsed.data;
  try {
    if (action === "path") return { ok: true, output: deps.path(env) };
    if (action === "list") return { ok: true, output: formatList(await deps.load(env)) };
    if (action === "get") {
      if (!key) return { ok: false, output: "get needs a key" };
      const settings = await deps.load(env);
      const v = (settings as Record<string, unknown>)[key];
      return { ok: true, output: `${key} = ${v === undefined ? "(unset)" : JSON.stringify(v)}` };
    }
    return await runSet(key, value, env, deps);
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}

/** Build the config tool with injectable settings I/O (tests pass fakes). */
export function buildConfigTool(deps: ConfigDeps = realDeps): Tool {
  return {
    schema: {
      name: "config_tool",
      description:
        "Read and update Vanta user settings during a session. " +
        "'get <key>' returns a setting's current value; 'list' shows all " +
        "updatable settings + their values; 'path' returns the settings file " +
        "path; 'set <key> <value>' persists a supported setting to settings.json. " +
        "Unsupported keys are rejected.",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["get", "list", "path", "set"],
            description: "get a value · list supported keys · path of the file · set a value",
          },
          key: { type: "string", description: "Setting key (required for get/set)." },
          value: { type: "string", description: "New value (required for set)." },
        },
      },
    },
    // Only the action + key reach the kernel — never the value, so a value like
    // "delete the repo" can't false-trigger the safety classifier. set names the
    // mutated key (kernel gates the config write); reads are an internal op.
    describeForSafety: (args) => {
      const parsed = Args.safeParse(args);
      if (!parsed.success) return "read vanta config";
      const { action, key } = parsed.data;
      return action === "set" ? `update setting ${key ?? "?"} in settings.json` : "read vanta config";
    },
    execute: (raw) => runConfig(raw, process.env, deps),
  };
}

export const configToolTool: Tool = buildConfigTool();
