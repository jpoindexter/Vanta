import { providerModelDiscoveryTarget } from "./index.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type ModelDiscoveryResult = {
  models: string[];
  source: "catalog" | "live";
  available: boolean;
  error?: string;
};

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

function records(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === "object") : [];
}

function modelIds(payload: unknown, kind: "openai" | "anthropic" | "gemini"): string[] {
  const object = payload && typeof payload === "object" ? payload as JsonObject : {};
  if (kind === "gemini") {
    return records(object.models)
      .filter((model) => !Array.isArray(model.supportedGenerationMethods) || model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => typeof model.baseModelId === "string" ? model.baseModelId : typeof model.name === "string" ? model.name.replace(/^models\//, "") : "")
      .filter(Boolean);
  }
  return records(object.data).map((model) => typeof model.id === "string" ? model.id : "").filter(Boolean);
}

function nextPage(payload: unknown, kind: "openai" | "anthropic" | "gemini"): string | null {
  const object = payload && typeof payload === "object" ? payload as JsonObject : {};
  if (kind === "gemini") return typeof object.nextPageToken === "string" ? object.nextPageToken : null;
  if (kind === "anthropic" && object.has_more === true && typeof object.last_id === "string") return object.last_id;
  return null;
}

function pageUrl(url: string, kind: "openai" | "anthropic" | "gemini", cursor: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(kind === "gemini" ? "pageToken" : "after_id", cursor);
  return parsed.toString();
}

function safeError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "Live model discovery timed out.";
  if (error instanceof Error && /^Model discovery failed \(HTTP \d+\)$/.test(error.message)) return error.message;
  return "Live model discovery is temporarily unavailable.";
}

async function discoverCodexSubscriptionModels(env: NodeJS.ProcessEnv): Promise<ModelDiscoveryResult> {
  const cachePath = join(env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "models_cache.json");
  try {
    const payload = JSON.parse(await readFile(cachePath, "utf8")) as JsonObject;
    const models = records(payload.models)
      .filter((model) => model.visibility !== "hide")
      .map((model) => typeof model.slug === "string" ? model.slug.trim() : "")
      .filter(Boolean);
    if (models.length === 0) {
      return { models: [], source: "catalog", available: true, error: "The connected Codex account returned no selectable models." };
    }
    return { models: [...new Set(models)], source: "live", available: true };
  } catch {
    return {
      models: [],
      source: "catalog",
      available: true,
      error: "Connected Codex model entitlements are unavailable. Run `codex login status`, then refresh models.",
    };
  }
}

export async function discoverProviderModels(
  providerId: string,
  env: NodeJS.ProcessEnv,
  fetcher: Fetcher = fetch,
): Promise<ModelDiscoveryResult> {
  if (providerId.trim().toLowerCase() === "codex") return discoverCodexSubscriptionModels(env);
  const target = providerModelDiscoveryTarget(env, providerId);
  if (!target) return { models: [], source: "catalog", available: false };

  try {
    const found: string[] = [];
    let url = target.url;
    for (let page = 0; page < 5; page += 1) {
      const response = await fetcher(url, { headers: target.headers, signal: AbortSignal.timeout(4_000) });
      if (!response.ok) throw new Error(`Model discovery failed (HTTP ${response.status})`);
      const payload: unknown = await response.json();
      found.push(...modelIds(payload, target.kind));
      const cursor = nextPage(payload, target.kind);
      if (!cursor) break;
      url = pageUrl(target.url, target.kind, cursor);
    }
    return { models: [...new Set(found)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse(), source: "live", available: true };
  } catch (error) {
    return { models: [], source: "catalog", available: true, error: safeError(error) };
  }
}
