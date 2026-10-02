import { existsSync } from "node:fs";
import { readFile,writeFile } from "node:fs/promises";
import http from "node:http";
import { providerById } from "../providers/catalog.js";
import { resolveProvider } from "../providers/index.js";
import type { LLMProvider } from "../providers/interface.js";
import { defaultProviderModelSettings,normalizeProviderModelSettings,providerModelSettingsCapabilities } from "../providers/model-settings.js";
import { providerOverrideEnv } from "../providers/override-env.js";
import { buildSummarizer } from "../session.js";
import { envPath,upsertEnvMigratingLegacy } from "../setup.js";
import { ensureDesktopConversation } from "./handler-conversation.js";
import { readJson,sendJson } from "./handler-http.js";
import { currentDesktopModelSettings } from "./handler-model-state.js";
import { desktopProviderOptionsLive,loadDesktopProviderCatalog } from "./handler-provider-catalog.js";
import { type DesktopState } from "./handler-state.js";

export function resolveDesktopProviderSelection(env: NodeJS.ProcessEnv, provider: string, model?: string): {
  provider: string;
  model: string;
  env: NodeJS.ProcessEnv;
  resolved: LLMProvider;
} {
  const id = provider.trim().toLowerCase();
  if (!id) throw new Error("provider is required");
  const selectedEnv = providerOverrideEnv(env, id, model?.trim() || undefined);
  const resolved = resolveProvider(selectedEnv);
  return { provider: id, model: resolved.modelId(), env: selectedEnv, resolved };
}

export async function handleModels(state: DesktopState, res: http.ServerResponse, providerId?: string): Promise<void> {
  const options = await desktopProviderOptionsLive(process.env, loadDesktopProviderCatalog, providerId);
  const currentProvider = state.providerId ?? process.env.VANTA_PROVIDER ?? "openai";
  const currentModel = state.modelId ?? process.env.VANTA_MODEL;
  sendJson(res, 200, options.map((option) => option.id === currentProvider && currentModel ? {
    ...option,
    current: true,
    modelSettings: providerModelSettingsCapabilities(option.id, currentModel, process.env),
  } : option));
}

export async function handleSetModel(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJson(req) as { provider?: unknown; model?: unknown; scope?: unknown };
  const provider = typeof body.provider === "string" ? body.provider : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const global = body.scope === "global";
  if (!provider) return sendJson(res, 400, { error: "provider is required" });
  try {
    const selection = resolveDesktopProviderSelection(process.env, provider, model || undefined);
    if (global) {
      await persistModelDefaults(state.root, { VANTA_PROVIDER: selection.provider, VANTA_MODEL: selection.model });
    }
    state.providerId = selection.provider;
    state.modelId = selection.model;
    applyProviderSelection(state, selection);
    const entry = providerById(selection.provider);
    sendJson(res, 200, { provider: selection.provider, model: selection.model, modelSettings: currentDesktopModelSettings(state), scope: global ? "global" : "session", label: entry?.label ?? selection.provider });
  } catch (err: unknown) {
    sendJson(res, 400, { error: modelErrorMessage(err), provider, model });
  }
}

async function persistModelDefaults(root: string, updates: Record<string, string>): Promise<void> {
  const existing = existsSync(envPath(root)) ? await readFile(envPath(root), "utf8") : "";
  await writeFile(envPath(root), upsertEnvMigratingLegacy(existing, updates), { mode: 0o600 });
  Object.assign(process.env, updates);
}

function applyProviderSelection(state: DesktopState, selection: ReturnType<typeof resolveDesktopProviderSelection>): void {
  const nextSettings = defaultProviderModelSettings(selection.provider, selection.model, {
    effortLevel: state.effortLevel ?? state.setup?.effortLevel,
    speed: state.providerSpeed,
  });
  state.effortLevel = nextSettings.effortLevel;
  state.providerSpeed = nextSettings.speed;
  if (state.setup) state.setup.provider = selection.resolved;
  state.convo?.setProvider(selection.resolved, buildSummarizer(selection.resolved));
}

async function persistSettingsDefaults(root: string, settings: ReturnType<typeof normalizeProviderModelSettings>): Promise<void> {
  const updates: Record<string, string> = {};
  if (settings.effortLevel) updates.VANTA_EFFORT_LEVEL = settings.effortLevel;
  if (settings.speed) updates.VANTA_SERVICE_TIER = settings.speed;
  await persistModelDefaults(root, updates);
}

export async function handleModelSettings(state: DesktopState, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const live = await ensureDesktopConversation(state);
  if (req.method === "GET") return sendJson(res, 200, currentDesktopModelSettings(live));
  const body = await readJson(req) as { effortLevel?: unknown; speed?: unknown; scope?: unknown };
  if (body.effortLevel === undefined && body.speed === undefined) {
    return sendJson(res, 400, { error: "effortLevel or speed is required" });
  }
  const provider = live.providerId ?? process.env.VANTA_PROVIDER ?? "openai";
  const model = live.modelId ?? live.setup.provider.modelId();
  try {
    const settings = normalizeProviderModelSettings(provider, model, body);
    applyModelSettings(live, settings);
    const global = body.scope === "global";
    if (global) {
      await persistSettingsDefaults(live.root, settings);
    }
    sendJson(res, 200, { provider, model, modelSettings: currentDesktopModelSettings(live), scope: global ? "global" : "session" });
  } catch (error) {
    sendJson(res, 400, { error: modelErrorMessage(error) });
  }
}

function modelErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyModelSettings(state: DesktopState, settings: ReturnType<typeof normalizeProviderModelSettings>): void {
  if (settings.effortLevel) state.effortLevel = settings.effortLevel;
  if (settings.speed) state.providerSpeed = settings.speed;
}
