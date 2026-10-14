import { PROVIDER_CATALOG } from "../providers/catalog.js";
import {
  type ControlCtx, type ControlTable, errorText, parseBody, sendFail,
} from "./control-http.js";
import {
  ConfigPatchSchema, FIELD_BY_KEY, availableFields, type ConfigFieldDef, type FieldContext,
} from "./config-fields.js";
import { loadDesktopPrefs } from "./desktop-prefs.js";
import { sendJson } from "./handler-http.js";

type Tree = Record<string, unknown>;

async function contextOf(ctx: ControlCtx): Promise<FieldContext> {
  const env = ctx.state._env ?? process.env;
  return { state: ctx.state, env, prefs: await loadDesktopPrefs(env) };
}

/** `a.b` -> `{ a: { b: value } }`, merged into the running tree. */
function setPath(tree: Tree, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = tree;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    node = typeof next === "object" && next !== null ? next as Tree : (node[part] = {}) as Tree;
  }
  node[parts[parts.length - 1]!] = value;
}

async function recordOf(fields: ConfigFieldDef[], ctx: FieldContext, pick: "read" | "fallback"): Promise<Tree> {
  const tree: Tree = {};
  for (const field of fields) {
    const value = pick === "read" ? await field.read(ctx) : field.fallback;
    if (value !== undefined) setPath(tree, field.key, value);
  }
  return tree;
}

function schemaOf(fields: ConfigFieldDef[], ctx: FieldContext) {
  const sections = [...new Set(fields.map((field) => field.section))];
  return {
    category_order: sections,
    fields: Object.fromEntries(fields.map((field) => [field.key, {
      category: field.section, description: field.description, type: field.type,
      ...(field.options ? { options: field.options(ctx) } : {}),
      ...(field.searchable ? { searchable: true } : {}),
    }])),
  };
}

const getConfig: ControlTable[string] = async (ctx) => {
  const field = await contextOf(ctx);
  sendJson(ctx.res, 200, await recordOf(availableFields(field), field, "read"));
};

const getDefaults: ControlTable[string] = async (ctx) => {
  const field = await contextOf(ctx);
  sendJson(ctx.res, 200, await recordOf(availableFields(field), field, "fallback"));
};

const getSchema: ControlTable[string] = async (ctx) => {
  const field = await contextOf(ctx);
  sendJson(ctx.res, 200, schemaOf(availableFields(field), field));
};

const TYPE_PROBLEM: Record<ConfigFieldDef["type"], { fits: (value: unknown) => boolean; say: string }> = {
  boolean: { fits: (value) => typeof value === "boolean", say: "true or false" },
  number: { fits: (value) => typeof value === "number" && Number.isFinite(value), say: "a number" },
  select: { fits: (value) => typeof value === "string", say: "text" },
  string: { fits: (value) => typeof value === "string", say: "text" },
};

/** Why a value cannot be stored, or null when it fits the field's type and options. */
function problemWith(field: ConfigFieldDef, value: unknown, ctx: FieldContext): string | null {
  const kind = TYPE_PROBLEM[field.type];
  if (!kind.fits(value)) return `${field.key} must be ${kind.say}`;
  const options = field.options?.(ctx);
  if (options && typeof value === "string" && value !== "" && !options.includes(value)) {
    return `${field.key} must be one of ${options.join(", ")}, got "${value.slice(0, 60)}"`;
  }
  return null;
}

/** Everything is checked before anything is written, so a bad key never leaves a half-applied patch. */
function planPatch(set: Record<string, unknown>, ctx: FieldContext): { plan: Array<[ConfigFieldDef, unknown]> } | { status: number; error: string } {
  const available = new Set(availableFields(ctx).map((field) => field.key));
  const plan: Array<[ConfigFieldDef, unknown]> = [];
  for (const [key, value] of Object.entries(set)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) return { status: 400, error: `${key} is not a setting Vanta Desktop applies. See GET /api/config/schema for the settings it serves.` };
    if (!available.has(key)) return { status: 409, error: `${key} does not apply to the current model.` };
    const problem = problemWith(field, value, ctx);
    if (problem) return { status: 400, error: problem };
    plan.push([field, value]);
  }
  return { plan };
}

const postConfig: ControlTable[string] = async (ctx) => {
  const body = await parseBody(ctx, ConfigPatchSchema);
  if (!body) return;
  const field = await contextOf(ctx);
  const planned = planPatch(body.set, field);
  if ("error" in planned) return sendFail(ctx.res, planned.status, planned.error);
  const applied: string[] = [];
  for (const [def, value] of planned.plan) {
    try {
      const refused = await def.write(field, value);
      if (refused) return sendFail(ctx.res, 400, applied.length ? `${refused} (already applied: ${applied.join(", ")})` : refused);
    } catch (error) { return sendFail(ctx.res, 500, errorText(error)); }
    applied.push(def.key);
  }
  const fresh = await contextOf(ctx);
  sendJson(ctx.res, 200, { ok: true, applied, config: await recordOf(availableFields(fresh), fresh, "read") });
};

/** Which provider keys exist. Values are never read into the response; keys are set through the setup flow. */
const getEnv: ControlTable[string] = async (ctx) => {
  const env = ctx.state._env ?? process.env;
  const rows = PROVIDER_CATALOG.flatMap((provider) => provider.envVar ? [[provider.envVar, {
    advanced: false, category: "provider", description: `${provider.label} API key`, is_password: true,
    is_set: Boolean(env[provider.envVar]?.trim()), provider: provider.id, provider_label: provider.label,
    redacted_value: null, tools: [], url: provider.signupUrl ?? null,
  }] as const] : []);
  sendJson(ctx.res, 200, Object.fromEntries(rows));
};

export const configGet: ControlTable = {
  "/api/config": getConfig, "/api/config/defaults": getDefaults, "/api/config/schema": getSchema, "/api/env": getEnv,
};
export const configPost: ControlTable = { "/api/config": postConfig };
