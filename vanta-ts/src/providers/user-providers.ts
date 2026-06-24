import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider } from "./interface.js";

// VANTA-USER-PROVIDERS — declare ANY OpenAI-compatible provider WITHOUT a code change,
// the same way ~/.vanta/agents.json adds agent CLIs and ~/.vanta/mcp.json adds MCP servers.
//
//   ~/.vanta/providers.json → { "providers": {
//     "tokenrouter": { "baseURL": "https://api.tokenrouter.com/v1", "keyEnv": "TOKENROUTER_API_KEY", "model": "MiniMax-M3", "router": true },
//     "nvidia-free": { "baseURL": "https://integrate.api.nvidia.com/v1", "keyEnv": "NVIDIA_API_KEY", "model": "deepseek-ai/deepseek-r1" },
//     "lan-llm":     { "baseURL": "http://192.168.1.5:8000/v1", "model": "qwen2.5:32b" }
//   } }
//
// Then: VANTA_PROVIDER=<id>  (+ optional VANTA_MODEL=<anything the endpoint serves>).
// The SECRET never lives in this file — only the env-var NAME (keyEnv); the actual key
// stays in .env. Omit keyEnv for keyless local endpoints. A user entry WINS over a
// built-in of the same id, so you can also fix a built-in's URL/model yourself.

export type UserProvider = { baseURL: string; keyEnv?: string; model?: string; router?: boolean };

/** Read + validate ~/.vanta/providers.json. Tolerant: a bad entry is dropped, never throws. */
export function loadUserProviders(env: NodeJS.ProcessEnv): Record<string, UserProvider> {
  let provs: unknown;
  try {
    const raw: unknown = JSON.parse(readFileSync(join(resolveVantaHome(env), "providers.json"), "utf8"));
    provs = (raw as { providers?: unknown } | null)?.providers;
  } catch {
    return {};
  }
  if (!provs || typeof provs !== "object") return {};
  const out: Record<string, UserProvider> = {};
  for (const [id, v] of Object.entries(provs as Record<string, unknown>)) {
    const p = v as Partial<UserProvider>;
    if (typeof p?.baseURL === "string" && /^https?:\/\//.test(p.baseURL)) {
      out[id.toLowerCase()] = {
        baseURL: p.baseURL,
        keyEnv: typeof p.keyEnv === "string" ? p.keyEnv : undefined,
        model: typeof p.model === "string" ? p.model : undefined,
        router: p.router === true,
      };
    }
  }
  return out;
}

/** Build an OpenAI-compatible provider from a user-declared entry. */
export function makeUserProvider(env: NodeJS.ProcessEnv, id: string, p: UserProvider): LLMProvider {
  const model = env.VANTA_MODEL ?? p.model;
  if (!model) {
    throw new Error(`No model for provider "${id}". Set VANTA_MODEL, or add "model" to its ~/.vanta/providers.json entry.`);
  }
  let apiKey = "-"; // keyless local endpoints — the OpenAI SDK still wants a non-empty string
  if (p.keyEnv) {
    const val = env[p.keyEnv];
    if (!val) throw new Error(`${p.keyEnv} is not set. Set it in vanta-ts/.env for the "${id}" provider (declared in ~/.vanta/providers.json).`);
    apiKey = val;
  }
  return new OpenAIProvider({ apiKey, baseURL: p.baseURL, model });
}
