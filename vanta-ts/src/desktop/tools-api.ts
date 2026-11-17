import { z } from "zod";
import { loadSettings } from "../settings/store.js";
import { updateUserSettings } from "../settings/user-edit.js";
import { buildRegistry } from "../tools/index.js";
import {
  type ControlCtx, type ControlPattern, type ControlTable, parseBody, sendFail, sendOk,
} from "./control-http.js";
import { sendJson } from "./handler-http.js";

const ToggleBody = z.object({ enabled: z.boolean() });

const env = (ctx: ControlCtx): NodeJS.ProcessEnv => ctx.state._env ?? process.env;

async function blockedNames(ctx: ControlCtx): Promise<Set<string>> {
  return new Set((await loadSettings(ctx.state.root, env(ctx))).blockedTools ?? []);
}

/**
 * Every registered tool as a one-tool "toolset" with its on/off state. Off means listed in
 * `blockedTools`; the registry drops those tools when the next session is prepared.
 */
const list: ControlTable[string] = async (ctx) => {
  const blocked = await blockedNames(ctx);
  const rows = buildRegistry().schemas().map((tool) => ({
    name: tool.name, label: tool.name, description: tool.description, enabled: !blocked.has(tool.name), configured: true, tools: [tool.name],
  })).sort((a, b) => a.name.localeCompare(b.name));
  sendJson(ctx.res, 200, rows);
};

const toggle: ControlTable[string] = async (ctx) => {
  const name = ctx.params[0] ?? "";
  const body = await parseBody(ctx, ToggleBody);
  if (!body) return;
  if (!buildRegistry().schemas().some((tool) => tool.name === name)) return sendFail(ctx.res, 404, `tool not found: ${name}`);
  await updateUserSettings((settings) => {
    const current = Array.isArray(settings.blockedTools) ? settings.blockedTools.filter((item): item is string => typeof item === "string") : [];
    const next = body.enabled ? current.filter((item) => item !== name) : [...new Set([...current, name])].sort();
    const { blockedTools: _old, ...others } = settings;
    return next.length ? { ...others, blockedTools: next } : others;
  }, env(ctx));
  const stillBlocked = (await blockedNames(ctx)).has(name);
  if (body.enabled && stillBlocked) {
    return sendFail(ctx.res, 409, `${name} is also blocked by this project's settings; remove it from .vanta/settings.json or settings.local.json.`);
  }
  sendOk(ctx.res, { name, enabled: body.enabled, appliesNextSession: true });
};

export const toolsGet: ControlTable = { "/api/tools/toolsets": list };
export const toolsPostPatterns: ControlPattern[] = [[/^\/api\/tools\/toolsets\/([^/]+)$/, toggle]];
