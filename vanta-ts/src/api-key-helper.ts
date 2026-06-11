import { spawn } from "node:child_process";
import type { Settings } from "./settings/store.js";

// Maps VANTA_PROVIDER values to the env var that carries their API key.
const PROVIDER_KEY_ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENAI_API_KEY",
  gemini: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "claude-code": "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
  brave: "BRAVE_KEY",
  serpapi: "SERPAPI_KEY",
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { value: string; expiresAt: number };
const _cache = new Map<string, CacheEntry>();

/** Execute the helper command and return its trimmed stdout. */
export async function runApiKeyHelper(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    const child = spawn(command, { shell: true });
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`api_key_helper exited ${code}: ${err.trim()}`));
      else resolve(out.trim());
    });
  });
}

/** Run the helper command, caching the result for ttlMs. */
export async function getCachedApiKey(command: string, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const now = Date.now();
  const entry = _cache.get(command);
  if (entry && entry.expiresAt > now) return entry.value;
  const value = await runApiKeyHelper(command);
  _cache.set(command, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * If settings.api_key_helper is set and the provider's key env var is not
 * already in env, run the helper and inject the result. Best-effort: never
 * throws; logs to stderr on failure.
 */
export async function prefetchApiKeyHelper(
  settings: Settings,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const cmd = settings.api_key_helper;
  if (!cmd) return;
  const provider = env.VANTA_PROVIDER ?? "openai";
  const envVar = PROVIDER_KEY_ENV[provider];
  if (!envVar || env[envVar]) return;
  try {
    const key = await getCachedApiKey(cmd);
    if (key) env[envVar] = key;
  } catch (e) {
    process.stderr.write(`[vanta] api_key_helper failed: ${String(e)}\n`);
  }
}
