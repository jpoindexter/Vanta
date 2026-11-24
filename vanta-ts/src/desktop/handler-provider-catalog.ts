import { join } from "node:path";
import { diskCacheDeps,mergeProviderCatalog,resolveCatalog } from "../providers/catalog-manifest.js";
import { PROVIDER_CATALOG,type ProviderEntry } from "../providers/catalog.js";
import { providerModelDiscoveryTarget } from "../providers/index.js";
import { discoverProviderModels,type ModelDiscoveryResult } from "../providers/model-discovery.js";
import { providerModelSettingsCapabilities,type ProviderModelSettingsCapabilities } from "../providers/model-settings.js";
import { loadUserProviders } from "../providers/user-providers.js";
import { resolveVantaHome } from "../store/home.js";

export type DesktopProviderOption = {
  id: string;
  label: string;
  short: string;
  defaultModel: string;
  models: string[];
  current: boolean;
  savedDefaultModel?: string;
  modelSource: "catalog" | "live";
  discoveryAvailable: boolean;
  discoveryError?: string;
  modelSettings: ProviderModelSettingsCapabilities;
};

export function desktopProviderOptions(env: NodeJS.ProcessEnv, catalog: ProviderEntry[] = PROVIDER_CATALOG): DesktopProviderOption[] {
  const current = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const options = catalogOptions(env, catalog, current);
  for (const [id, provider] of Object.entries(loadUserProviders(env))) {
    options.set(id, userProviderOption(env, id, provider, current));
  }
  return [...options.values()];
}

function catalogOptions(env: NodeJS.ProcessEnv, catalog: ProviderEntry[], current: string): Map<string, DesktopProviderOption> {
  const options = new Map<string, DesktopProviderOption>();
  for (const provider of catalog) {
    const isDefaultProvider = provider.id === current;
    options.set(provider.id, {
      id: provider.id,
      label: provider.label,
      short: provider.short,
      defaultModel: provider.defaultModel,
      models: provider.models,
      current: isDefaultProvider,
      savedDefaultModel: isDefaultProvider ? env.VANTA_MODEL ?? provider.defaultModel : undefined,
      modelSource: "catalog",
      discoveryAvailable: provider.id === "codex" || Boolean(providerModelDiscoveryTarget(env, provider.id)),
      modelSettings: providerModelSettingsCapabilities(provider.id, isDefaultProvider ? env.VANTA_MODEL ?? provider.defaultModel : provider.defaultModel, env),
    });
  }
  return options;
}

function userProviderOption(env: NodeJS.ProcessEnv, id: string, provider: ReturnType<typeof loadUserProviders>[string], current: string): DesktopProviderOption {
    const isDefaultProvider = id === current;
    return {
      id,
      label: id,
      short: "User-declared OpenAI-compatible provider",
      defaultModel: provider.model ?? "",
      models: provider.model ? [provider.model] : [],
      current: isDefaultProvider,
      savedDefaultModel: isDefaultProvider ? env.VANTA_MODEL ?? provider.model : undefined,
      modelSource: "catalog",
      discoveryAvailable: Boolean(providerModelDiscoveryTarget(env, id)),
      modelSettings: providerModelSettingsCapabilities(id, isDefaultProvider ? env.VANTA_MODEL ?? provider.model ?? "" : provider.model ?? "", env),
    };
}

export type DesktopCatalogLoader = (env: NodeJS.ProcessEnv) => Promise<ProviderEntry[]>;

export async function fetchCatalogJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });
  return response.ok ? response.json() : null;
}

export const loadDesktopProviderCatalog: DesktopCatalogLoader = async (env) => {
  const cachePath = join(resolveVantaHome(env), "model-catalog.json");
  const catalog = await resolveCatalog({
    ...diskCacheDeps(cachePath),
    fetchJson: fetchCatalogJson,
    now: Date.now(),
  });
  return catalog.providers;
};

export type DesktopModelDiscoverer = (providerId: string, env: NodeJS.ProcessEnv) => Promise<ModelDiscoveryResult>;

export async function desktopProviderOptionsLive(
  env: NodeJS.ProcessEnv,
  loadCatalog: DesktopCatalogLoader = loadDesktopProviderCatalog,
  providerId?: string,
  discover: DesktopModelDiscoverer = discoverProviderModels,
): Promise<DesktopProviderOption[]> {
  const options = desktopProviderOptions(env, mergeProviderCatalog(await loadCatalog(env)));
  // Codex discovery reads local account metadata; ordinary refreshes must not
  // replace it with bundled guesses. Other provider APIs remain opt-in refresh.
  const id = (providerId ?? "codex").trim().toLowerCase();
  const result = await discover(id, env);
  return options.map((option) => option.id !== id ? option : {
    ...option,
    models: id === "codex" && result.source === "live"
      ? result.models
      : [...new Set([...result.models, ...option.models])],
    modelSource: result.source,
    discoveryAvailable: result.available,
    discoveryError: result.error,
  });
}
