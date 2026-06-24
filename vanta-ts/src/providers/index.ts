import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { CodexProvider } from "./codex.js";
import { resolveClaudeCodeToken } from "./claude-code-auth.js";
import type { LLMProvider } from "./interface.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const NVIDIA_NIM_URL = "https://integrate.api.nvidia.com/v1";

function requireKey(env: NodeJS.ProcessEnv, key: string, hint: string): string {
  const val = env[key];
  if (!val) throw new Error(`${key} is not set. ${hint}`);
  return val;
}

function makeOpenAI(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "OPENAI_API_KEY",
    "Run `vanta setup`, or set it in vanta-ts/.env, or use VANTA_PROVIDER=ollama for local models.");
  return new OpenAIProvider({ apiKey, model: env.VANTA_MODEL ?? "gpt-4o-mini" });
}

function makeOllama(env: NodeJS.ProcessEnv): LLMProvider {
  return new OpenAIProvider({
    apiKey: "ollama",
    baseURL: env.VANTA_OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
    model: env.VANTA_MODEL ?? "qwen2.5:14b",
  });
}

function makeAnthropic(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "ANTHROPIC_API_KEY",
    "Run `vanta setup`, set it in vanta-ts/.env, use VANTA_PROVIDER=claude-code for a Claude subscription, or VANTA_PROVIDER=openai|ollama.");
  return new AnthropicProvider({ apiKey, model: env.VANTA_MODEL ?? "claude-sonnet-4-6" });
}

function makeCodex(env: NodeJS.ProcessEnv): LLMProvider {
  return new CodexProvider({ model: env.VANTA_MODEL ?? "gpt-5.5" });
}

function makeClaudeCode(env: NodeJS.ProcessEnv): LLMProvider {
  return new AnthropicProvider({ authToken: resolveClaudeCodeToken(env), model: env.VANTA_MODEL ?? "claude-sonnet-4-6" });
}

function makeGemini(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Run `vanta setup`, or get a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in vanta-ts/.env.");
  return new OpenAIProvider({ apiKey, baseURL: GEMINI_OPENAI_URL, model: env.VANTA_MODEL ?? "gemini-2.5-flash" });
}

function makeOpenRouter(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "OPENROUTER_API_KEY",
    "Run `vanta setup`, or get a key at https://openrouter.ai/keys and set OPENROUTER_API_KEY in vanta-ts/.env.");
  return new OpenAIProvider({ apiKey, baseURL: OPENROUTER_URL, model: env.VANTA_MODEL ?? "anthropic/claude-sonnet-4.5" });
}

function makeNvidia(env: NodeJS.ProcessEnv): LLMProvider {
  const apiKey = requireKey(env, "NVIDIA_API_KEY",
    "Get a key at https://build.nvidia.com/settings/api-keys and set NVIDIA_API_KEY in vanta-ts/.env.");
  return new OpenAIProvider({ apiKey, baseURL: NVIDIA_NIM_URL, model: env.VANTA_MODEL ?? "meta/llama-3.1-70b-instruct" });
}

// OpenAI-compatible providers — same SDK, baseURL + key swap. To add one: an entry
// here + a matching ProviderEntry in catalog.ts. Models are defaults the picker can override.
const OPENAI_COMPAT: Record<string, { url: string; key: string; model: string }> = {
  deepseek: { url: "https://api.deepseek.com/v1", key: "DEEPSEEK_API_KEY", model: "deepseek-chat" },
  xai: { url: "https://api.x.ai/v1", key: "XAI_API_KEY", model: "grok-4" },
  groq: { url: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY", model: "llama-3.3-70b-versatile" },
  mistral: { url: "https://api.mistral.ai/v1", key: "MISTRAL_API_KEY", model: "mistral-large-latest" },
  together: { url: "https://api.together.xyz/v1", key: "TOGETHER_API_KEY", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  fireworks: { url: "https://api.fireworks.ai/inference/v1", key: "FIREWORKS_API_KEY", model: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  cerebras: { url: "https://api.cerebras.ai/v1", key: "CEREBRAS_API_KEY", model: "llama-3.3-70b" },
  moonshot: { url: "https://api.moonshot.ai/v1", key: "MOONSHOT_API_KEY", model: "kimi-k2-0905-preview" },
  minimax: { url: "https://api.minimax.io/v1", key: "MINIMAX_API_KEY", model: "MiniMax-M2" },
  tokenrouter: { url: "https://api.tokenrouter.com/v1", key: "TOKENROUTER_API_KEY", model: "MiniMax-M3" }, // OpenAI-compat router (verified live: .com/v1, bare model ids)
  zai: { url: "https://api.z.ai/api/paas/v4", key: "ZAI_API_KEY", model: "glm-4.6" },
  qwen: { url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", key: "DASHSCOPE_API_KEY", model: "qwen-max" },
  novita: { url: "https://api.novita.ai/v3/openai", key: "NOVITA_API_KEY", model: "deepseek/deepseek-v3-0324" },
  perplexity: { url: "https://api.perplexity.ai", key: "PERPLEXITY_API_KEY", model: "sonar" },
  huggingface: { url: "https://router.huggingface.co/v1", key: "HF_TOKEN", model: "meta-llama/Llama-3.3-70B-Instruct" },
  stepfun: { url: "https://api.stepfun.com/v1", key: "STEPFUN_API_KEY", model: "step-2-16k" },
  lmstudio: { url: "http://localhost:1234/v1", key: "", model: "local-model" }, // local, no key
};

/** Azure OpenAI / AI Foundry — OpenAI-compatible but with an api-version query + api-key header. */
function makeAzure(env: NodeJS.ProcessEnv): LLMProvider {
  const endpoint = requireKey(env, "AZURE_OPENAI_ENDPOINT", "e.g. https://<resource>.openai.azure.com");
  const deployment = requireKey(env, "AZURE_OPENAI_DEPLOYMENT", "your Azure deployment name");
  const apiKey = requireKey(env, "AZURE_OPENAI_API_KEY", "your Azure OpenAI key");
  return new OpenAIProvider({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}`,
    model: env.VANTA_MODEL ?? deployment,
    defaultQuery: { "api-version": env.AZURE_OPENAI_API_VERSION ?? "2024-10-21" },
    defaultHeaders: { "api-key": apiKey },
  });
}

/** Any OpenAI-compatible endpoint — point VANTA_OPENAI_BASE_URL at it (covers Arcee, GMI, Kilo, OpenCode, …). */
function makeCustom(env: NodeJS.ProcessEnv): LLMProvider {
  const baseURL = requireKey(env, "VANTA_OPENAI_BASE_URL", "Set the OpenAI-compatible endpoint URL (e.g. https://api.example.com/v1).");
  return new OpenAIProvider({
    apiKey: env.VANTA_OPENAI_KEY ?? env.OPENAI_API_KEY ?? "none",
    baseURL,
    model: env.VANTA_MODEL ?? "default",
  });
}

function makeCompat(c: { url: string; key: string; model: string }): (env: NodeJS.ProcessEnv) => LLMProvider {
  return (env) => new OpenAIProvider({
    apiKey: c.key ? requireKey(env, c.key, `Set ${c.key} in vanta-ts/.env (or run \`vanta setup\`).`) : "local",
    baseURL: c.url,
    model: env.VANTA_MODEL ?? c.model,
  });
}

const PROVIDERS: Record<string, (env: NodeJS.ProcessEnv) => LLMProvider> = {
  openai: makeOpenAI,
  ollama: makeOllama,
  anthropic: makeAnthropic,
  codex: makeCodex,
  "openai-codex": makeCodex,
  "claude-code": makeClaudeCode,
  "claude-cli": makeClaudeCode,
  gemini: makeGemini,
  openrouter: makeOpenRouter,
  nvidia: makeNvidia,
  nim: makeNvidia,
  azure: makeAzure,
  custom: makeCustom,
  ...Object.fromEntries(Object.entries(OPENAI_COMPAT).map(([id, c]) => [id, makeCompat(c)])),
};

/**
 * Resolve an LLM provider from environment.
 *   VANTA_PROVIDER=openai     → api.openai.com (needs OPENAI_API_KEY)
 *   VANTA_PROVIDER=ollama     → local Ollama, OpenAI-compatible
 *   VANTA_PROVIDER=anthropic  → api.anthropic.com (needs ANTHROPIC_API_KEY)
 *   VANTA_PROVIDER=gemini     → Google Gemini via OpenAI-compat (needs GEMINI_API_KEY)
 *   VANTA_PROVIDER=openrouter → OpenRouter (needs OPENROUTER_API_KEY)
 *   VANTA_PROVIDER=claude-code → Claude via your Pro/Max subscription token (grey area)
 *   VANTA_PROVIDER=codex      → OpenAI Codex via your ChatGPT subscription (OAuth)
 */
export function resolveProvider(env: NodeJS.ProcessEnv): LLMProvider {
  const id = (env.VANTA_PROVIDER ?? "openai").toLowerCase();
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown VANTA_PROVIDER "${id}". Run \`vanta setup\` to pick one, or see the list: ${Object.keys(PROVIDERS).join(", ")}.`);
  return factory(env);
}

export type { LLMProvider } from "./interface.js";
